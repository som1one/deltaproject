"""HTTP: GET /admin/finance/preview (калькулятор)."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from dependencies.auth import get_current_admin_or_tech
from dependencies.database import get_db
from enums.user import UserRole
from main import create_app
from models.blogger_finance_scheme import BloggerFinanceScheme
from services.finance_scheme_service import (
    DEFAULT_WEIGHT_BLOGER,
    DEFAULT_WEIGHT_PLATFORM,
    DEFAULT_WEIGHT_UPLINE,
    DEFAULT_WEIGHT_WORKER,
)


@pytest.mark.asyncio
async def test_finance_preview_404_when_user_missing() -> None:
    app = create_app()
    admin = MagicMock()
    admin.role = UserRole.ADMIN
    app.dependency_overrides[get_current_admin_or_tech] = lambda: admin

    async def fake_db():
        s = AsyncMock()
        s.get = AsyncMock(return_value=None)
        yield s

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get(
                "/admin/finance/preview",
                params={"bloger_id": str(uuid.uuid4()), "price_kopeks": 1000},
            )
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_finance_preview_200_and_sum_matches() -> None:
    bloger_id = uuid.uuid4()
    blogger = MagicMock()
    blogger.role = UserRole.BLOGER

    scheme = BloggerFinanceScheme(
        blogger_id=bloger_id,
        weight_worker=DEFAULT_WEIGHT_WORKER,
        weight_bloger=DEFAULT_WEIGHT_BLOGER,
        weight_upline=DEFAULT_WEIGHT_UPLINE,
        weight_platform=DEFAULT_WEIGHT_PLATFORM,
    )

    app = create_app()
    admin = MagicMock()
    admin.role = UserRole.ADMIN
    app.dependency_overrides[get_current_admin] = lambda: admin

    async def fake_db():
        s = AsyncMock()

        async def getter(_model, pk):
            return blogger if pk == bloger_id else None

        s.get = AsyncMock(side_effect=getter)
        yield s

    app.dependency_overrides[get_db] = fake_db
    try:
        with patch(
            "routers.admin.get_or_create_scheme_for_blogger",
            AsyncMock(return_value=scheme),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                r = await ac.get(
                    "/admin/finance/preview",
                    params={"bloger_id": str(bloger_id), "price_kopeks": 100_000},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["price_kopeks"] == 100_000
        total = (
            data["worker_kopeks"]
            + data["bloger_kopeks"]
            + data["upline_kopeks"]
            + data["platform_kopeks"]
        )
        assert total == 100_000
        assert data["weight_worker"] == DEFAULT_WEIGHT_WORKER
    finally:
        app.dependency_overrides.clear()
