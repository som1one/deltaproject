"""HTTP: маркетплейс-баланс виден в /me, ручной флоу вывода средств.

Регрессия на «деньги начислены, но их никто не видит»: distribute_funds
кредитует marketplace_balance_kopeks, а кабинеты читали только легаси balance.
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from dependencies.auth import get_current_user
from dependencies.database import get_db
from enums.user import UserRole
from main import create_app
from models.marketplace_withdrawal import MarketplaceWithdrawal


def _make_user(role: UserRole, marketplace_balance_kopeks: int = 0) -> MagicMock:
    user = MagicMock()
    user.id = uuid.uuid4()
    user.name = "Test User"
    user.email = "test@example.com"
    user.nickname = None
    user.telegram = None
    user.photo_url = None
    user.role = role
    user.linked_to = None
    user.percent = 10.0
    user.balance = 0
    user.marketplace_balance_kopeks = marketplace_balance_kopeks
    user.payout_card_last4 = None
    user.payout_card_brand = None
    user.payout_card_holder = None
    user.payout_card_bank = None
    user.payout_card_hash = None
    user.blogger_cabinet_pin_hash = None
    user.is_active = True
    return user


@pytest.mark.asyncio
async def test_me_includes_marketplace_balance() -> None:
    """GET /me отдаёт marketplace_balance_kopeks — кабинет строит на нём выводы."""
    app = create_app()
    user = _make_user(UserRole.WORKER, marketplace_balance_kopeks=123_456)
    app.dependency_overrides[get_current_user] = lambda: user

    async def fake_db():
        session = AsyncMock()
        pending = MagicMock()
        pending.scalar_one = MagicMock(return_value=0)
        session.execute = AsyncMock(return_value=pending)
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get("/me")
        assert r.status_code == 200
        data = r.json()
        assert data["marketplace_balance_kopeks"] == 123_456
        assert data["balance"] == 0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_withdrawal_creates_pending_manual_request() -> None:
    """POST /marketplace/withdrawals — ручной флоу: PENDING-запрос без ЮKassa.

    Выплату подтверждает или отклоняет администратор в админке;
    платёжный шлюз в создании запроса не участвует и его отсутствие
    не должно блокировать вывод.
    """
    app = create_app()
    user = _make_user(UserRole.BLOGER, marketplace_balance_kopeks=50_000)
    user.payout_card_hash = "deadbeef"
    app.dependency_overrides[get_current_user] = lambda: user

    session = AsyncMock()
    lock_result = MagicMock()
    lock_result.scalar_one = MagicMock(return_value=user)
    session.execute = AsyncMock(return_value=lock_result)
    session.add = MagicMock()

    async def fake_refresh(obj: MarketplaceWithdrawal) -> None:
        # Поля, которые в проде проставляет БД (default/server_default)
        obj.id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        obj.created_at = now
        obj.updated_at = now

    session.refresh = AsyncMock(side_effect=fake_refresh)

    async def fake_db():
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post("/marketplace/withdrawals", json={"amount_kopeks": 10_000})
        assert r.status_code == 201
        body = r.json()
        assert body["status"] == "pending"
        assert body["amount_kopeks"] == 10_000
        assert body["yookassa_payout_id"] is None
        # Создана запись вывода и закоммичено списание баланса
        added = session.add.call_args.args[0]
        assert isinstance(added, MarketplaceWithdrawal)
        assert added.amount_kopeks == 10_000
        session.commit.assert_awaited()
    finally:
        app.dependency_overrides.clear()
