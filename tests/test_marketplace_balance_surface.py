"""HTTP: маркетплейс-баланс виден в /me, гард выплат при ненастроенном шлюзе.

Регрессия на «деньги начислены, но их никто не видит»: distribute_funds
кредитует marketplace_balance_kopeks, а кабинеты читали только легаси balance.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from dependencies.auth import get_current_user
from dependencies.database import get_db
from enums.user import UserRole
from main import create_app


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
async def test_withdrawal_503_when_gateway_inactive() -> None:
    """POST /marketplace/withdrawals без настроенной ЮKassa — 503 до списания.

    Раньше запрос доходил до create_payout, падал после списания и отвечал
    фантомной PENDING-записью, которую откатывал teardown сессии.
    """
    app = create_app()
    user = _make_user(UserRole.BLOGER, marketplace_balance_kopeks=50_000)
    user.payout_card_hash = "deadbeef"
    app.dependency_overrides[get_current_user] = lambda: user

    session = AsyncMock()

    async def fake_db():
        yield session

    app.dependency_overrides[get_db] = fake_db
    creds = MagicMock()
    creds.active = False
    try:
        with patch(
            "services.marketplace_payment_settings_service.get_effective_yookassa",
            new=AsyncMock(return_value=creds),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                r = await ac.post("/marketplace/withdrawals", json={"amount_kopeks": 10_000})
        assert r.status_code == 503
        assert "шлюз" in r.json()["detail"]
        # Ни списания, ни записи вывода не создавалось
        session.execute.assert_not_awaited()
        session.add.assert_not_called()
    finally:
        app.dependency_overrides.clear()
