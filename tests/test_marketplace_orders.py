"""HTTP: Marketplace Orders Router (/marketplace/orders)."""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from dependencies.auth import get_current_user
from dependencies.database import get_db
from enums.marketplace import MarketplaceOrderStatus
from enums.user import UserRole
from main import create_app
from models.blogger_profile import BloggerProfile
from models.marketplace_order import MarketplaceOrder
from models.marketplace_settings import MarketplaceSettings


def _make_client_user(referred_by: uuid.UUID | None = None) -> MagicMock:
    user = MagicMock()
    user.id = uuid.uuid4()
    user.name = "Test Client"
    user.role = UserRole.CLIENT
    user.is_active = True
    user.marketplace_referred_by = referred_by
    return user


def _make_blogger_user() -> MagicMock:
    user = MagicMock()
    user.id = uuid.uuid4()
    user.name = "Test Blogger"
    user.role = UserRole.BLOGER
    user.is_active = True
    user.marketplace_referred_by = None
    return user


def _make_worker_user() -> MagicMock:
    user = MagicMock()
    user.id = uuid.uuid4()
    user.name = "Test Worker"
    user.role = UserRole.WORKER
    user.is_active = True
    user.marketplace_referred_by = None
    return user


def _make_settings() -> MagicMock:
    settings = MagicMock(spec=MarketplaceSettings)
    settings.id = 1
    settings.platform_commission_pct = Decimal("25.00")
    settings.worker_referral_commission_pct = Decimal("5.00")
    return settings


def _make_profile(user_id: uuid.UUID) -> MagicMock:
    profile = MagicMock(spec=BloggerProfile)
    profile.id = uuid.uuid4()
    profile.user_id = user_id
    profile.category = "tech"
    profile.subscriber_count = 50000
    profile.average_price_kopeks = 500000
    profile.is_active = True
    profile.orders_enabled = True
    return profile


def _make_order(
    client_id: uuid.UUID,
    blogger_id: uuid.UUID,
    worker_id: uuid.UUID | None = None,
    status: str = MarketplaceOrderStatus.PENDING_PAYMENT.value,
) -> MagicMock:
    order = MagicMock(spec=MarketplaceOrder)
    order.id = uuid.uuid4()
    order.client_id = client_id
    order.blogger_id = blogger_id
    order.worker_id = worker_id
    order.status = status
    order.amount_kopeks = 500000
    order.message = "Тестовое сообщение"
    order.platform_commission_pct = Decimal("25.00")
    order.worker_commission_pct = Decimal("5.00") if worker_id else Decimal("0.00")
    order.yookassa_payment_id = None
    order.payment_url = None
    order.payment_expires_at = None
    order.created_at = datetime.now(timezone.utc)
    order.paid_at = None
    order.completed_at = None
    order.updated_at = datetime.now(timezone.utc)
    return order


# --- POST /marketplace/orders ---


@pytest.mark.asyncio
async def test_create_order_201_success() -> None:
    """POST /marketplace/orders creates order for client."""
    app = create_app()
    blogger = _make_blogger_user()
    client = _make_client_user()
    profile = _make_profile(blogger.id)
    settings = _make_settings()

    app.dependency_overrides[get_current_user] = lambda: client

    async def fake_db():
        session = AsyncMock()

        call_count = {"n": 0}

        async def mock_execute(stmt):
            call_count["n"] += 1
            result = MagicMock()
            if call_count["n"] == 1:
                # BloggerProfile lookup
                result.scalar_one_or_none = MagicMock(return_value=profile)
            elif call_count["n"] == 2:
                # MarketplaceSettings lookup
                result.scalar_one_or_none = MagicMock(return_value=settings)
            return result

        session.execute = mock_execute
        session.add = MagicMock()
        session.flush = AsyncMock()
        session.commit = AsyncMock()

        async def fake_refresh(obj):
            obj.id = uuid.uuid4()
            obj.status = MarketplaceOrderStatus.PENDING_PAYMENT.value
            obj.amount_kopeks = profile.average_price_kopeks
            obj.message = "Хочу рекламу"
            obj.platform_commission_pct = Decimal("25.00")
            obj.worker_commission_pct = Decimal("0.00")
            obj.client_id = client.id
            obj.blogger_id = blogger.id
            obj.worker_id = None
            obj.yookassa_payment_id = None
            obj.payment_url = None
            obj.payment_expires_at = None
            obj.created_at = datetime.now(timezone.utc)
            obj.paid_at = None
            obj.completed_at = None
            obj.updated_at = datetime.now(timezone.utc)

        session.refresh = fake_refresh
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/orders",
                json={
                    "blogger_id": str(blogger.id),
                    "message": "Хочу рекламу",
                    "amount_kopeks": 500000,
                },
            )
        assert r.status_code == 201
        data = r.json()
        assert data["status"] == "PENDING_PAYMENT"
        assert data["amount_kopeks"] == 500000
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_order_403_non_client() -> None:
    """POST /marketplace/orders returns 403 for non-client users."""
    app = create_app()
    blogger = _make_blogger_user()
    app.dependency_overrides[get_current_user] = lambda: blogger

    async def fake_db():
        session = AsyncMock()
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/orders",
                json={
                    "blogger_id": str(uuid.uuid4()),
                    "message": "Test message",
                    "amount_kopeks": 500000,
                },
            )
        assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_order_422_empty_message() -> None:
    """POST /marketplace/orders returns 422 for empty message."""
    app = create_app()
    client = _make_client_user()
    app.dependency_overrides[get_current_user] = lambda: client

    async def fake_db():
        session = AsyncMock()
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/orders",
                json={
                    "blogger_id": str(uuid.uuid4()),
                    "message": "",
                    "amount_kopeks": 500000,
                },
            )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_order_422_message_too_long() -> None:
    """POST /marketplace/orders returns 422 for message > 1000 chars."""
    app = create_app()
    client = _make_client_user()
    app.dependency_overrides[get_current_user] = lambda: client

    async def fake_db():
        session = AsyncMock()
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/orders",
                json={
                    "blogger_id": str(uuid.uuid4()),
                    "message": "x" * 1001,
                    "amount_kopeks": 500000,
                },
            )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_order_404_blogger_not_found() -> None:
    """POST /marketplace/orders returns 404 if blogger profile not found."""
    app = create_app()
    client = _make_client_user()
    app.dependency_overrides[get_current_user] = lambda: client

    async def fake_db():
        session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=None)
        session.execute = AsyncMock(return_value=result)
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/orders",
                json={
                    "blogger_id": str(uuid.uuid4()),
                    "message": "Valid message",
                    "amount_kopeks": 500000,
                },
            )
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_order_400_blogger_inactive() -> None:
    """POST /marketplace/orders returns 400 if blogger is inactive."""
    app = create_app()
    client = _make_client_user()
    blogger = _make_blogger_user()
    profile = _make_profile(blogger.id)
    profile.is_active = False

    app.dependency_overrides[get_current_user] = lambda: client

    async def fake_db():
        session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=profile)
        session.execute = AsyncMock(return_value=result)
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/orders",
                json={
                    "blogger_id": str(blogger.id),
                    "message": "Valid message",
                    "amount_kopeks": 500000,
                },
            )
        assert r.status_code == 400
        assert "неактивен" in r.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_order_400_orders_disabled() -> None:
    """POST /marketplace/orders returns 400 if blogger has orders disabled."""
    app = create_app()
    client = _make_client_user()
    blogger = _make_blogger_user()
    profile = _make_profile(blogger.id)
    profile.orders_enabled = False

    app.dependency_overrides[get_current_user] = lambda: client

    async def fake_db():
        session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=profile)
        session.execute = AsyncMock(return_value=result)
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/orders",
                json={
                    "blogger_id": str(blogger.id),
                    "message": "Valid message",
                    "amount_kopeks": 500000,
                },
            )
        assert r.status_code == 400
        assert "не принимает" in r.json()["detail"]
    finally:
        app.dependency_overrides.clear()


# --- GET /marketplace/orders ---


@pytest.mark.asyncio
async def test_list_orders_200_client() -> None:
    """GET /marketplace/orders returns client's orders."""
    app = create_app()
    client = _make_client_user()
    blogger = _make_blogger_user()
    order = _make_order(client.id, blogger.id)

    app.dependency_overrides[get_current_user] = lambda: client

    async def fake_db():
        session = AsyncMock()
        call_count = {"n": 0}

        async def mock_execute(stmt):
            call_count["n"] += 1
            result = MagicMock()
            if call_count["n"] == 1:
                # Count query
                result.scalar_one = MagicMock(return_value=1)
            else:
                # Items query
                scalars_mock = MagicMock()
                scalars_mock.all = MagicMock(return_value=[order])
                result.scalars = MagicMock(return_value=scalars_mock)
            return result

        session.execute = mock_execute
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get("/marketplace/orders")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_orders_403_worker() -> None:
    """GET /marketplace/orders returns 403 for worker role."""
    app = create_app()
    worker = _make_worker_user()
    app.dependency_overrides[get_current_user] = lambda: worker

    async def fake_db():
        session = AsyncMock()
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get("/marketplace/orders")
        assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()


# --- GET /marketplace/orders/{order_id} ---


@pytest.mark.asyncio
async def test_get_order_200_client_owner() -> None:
    """GET /marketplace/orders/{id} returns order for client owner."""
    app = create_app()
    client = _make_client_user()
    blogger = _make_blogger_user()
    order = _make_order(client.id, blogger.id)

    app.dependency_overrides[get_current_user] = lambda: client

    async def fake_db():
        session = AsyncMock()
        # execute calls in order: order, settlement account (None),
        # payment settings (None), party names lookup
        order_result = MagicMock()
        order_result.scalar_one_or_none = MagicMock(return_value=order)
        sa_result = MagicMock()
        sa_result.scalar_one_or_none = MagicMock(return_value=None)
        payment_result = MagicMock()
        payment_result.scalar_one_or_none = MagicMock(return_value=None)
        names_result = MagicMock()
        names_result.all = MagicMock(return_value=[])
        session.execute = AsyncMock(
            side_effect=[order_result, sa_result, payment_result, names_result]
        )
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get(f"/marketplace/orders/{order.id}")
        assert r.status_code == 200
        data = r.json()
        assert data["settlement_account"] is None
        assert "cancel" in data["available_actions"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_order_403_unauthorized() -> None:
    """GET /marketplace/orders/{id} returns 403 for unrelated user."""
    app = create_app()
    other_client = _make_client_user()
    blogger = _make_blogger_user()
    order = _make_order(uuid.uuid4(), blogger.id)  # different client

    app.dependency_overrides[get_current_user] = lambda: other_client

    async def fake_db():
        session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=order)
        session.execute = AsyncMock(return_value=result)
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get(f"/marketplace/orders/{order.id}")
        assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_order_404_not_found() -> None:
    """GET /marketplace/orders/{id} returns 404 for non-existent order."""
    app = create_app()
    client = _make_client_user()
    app.dependency_overrides[get_current_user] = lambda: client

    async def fake_db():
        session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=None)
        session.execute = AsyncMock(return_value=result)
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get(f"/marketplace/orders/{uuid.uuid4()}")
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


# --- PATCH /marketplace/orders/{order_id}/complete ---


@pytest.mark.asyncio
async def test_complete_order_403_non_blogger() -> None:
    """PATCH /marketplace/orders/{id}/complete returns 403 for non-blogger."""
    app = create_app()
    client = _make_client_user()
    app.dependency_overrides[get_current_user] = lambda: client

    async def fake_db():
        session = AsyncMock()
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.patch(f"/marketplace/orders/{uuid.uuid4()}/complete")
        assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_complete_order_200_success() -> None:
    """PATCH /marketplace/orders/{id}/complete transitions to BLOGGER_CONFIRMED."""
    app = create_app()
    blogger = _make_blogger_user()
    client = _make_client_user()
    order = _make_order(client.id, blogger.id, status=MarketplaceOrderStatus.ESCROW_HELD.value)

    app.dependency_overrides[get_current_user] = lambda: blogger

    async def fake_db():
        session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=order)
        session.execute = AsyncMock(return_value=result)
        session.add = MagicMock()
        session.flush = AsyncMock()
        session.commit = AsyncMock()

        async def fake_refresh(obj):
            # After transition, status should be BLOGGER_CONFIRMED
            obj.status = MarketplaceOrderStatus.BLOGGER_CONFIRMED.value

        session.refresh = fake_refresh
        yield session

    app.dependency_overrides[get_db] = fake_db

    with patch(
        "routers.marketplace_orders.notification_service.notify",
        new_callable=AsyncMock,
    ) as mock_notify:
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                r = await ac.patch(f"/marketplace/orders/{order.id}/complete")
            assert r.status_code == 200
            data = r.json()
            assert data["status"] == "BLOGGER_CONFIRMED"
            mock_notify.assert_called_once()
            call_kwargs = mock_notify.call_args.kwargs
            assert call_kwargs["user_id"] == client.id
            assert call_kwargs["event_type"] == "blogger_confirmed"
            assert call_kwargs["payload"]["order_id"] == str(order.id)
            assert call_kwargs["payload"]["blogger_name"] == blogger.name
        finally:
            app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_complete_order_403_wrong_blogger() -> None:
    """PATCH /marketplace/orders/{id}/complete returns 403 for non-assigned blogger."""
    app = create_app()
    blogger = _make_blogger_user()
    client = _make_client_user()
    order = _make_order(client.id, uuid.uuid4(), status=MarketplaceOrderStatus.ESCROW_HELD.value)

    app.dependency_overrides[get_current_user] = lambda: blogger

    async def fake_db():
        session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=order)
        session.execute = AsyncMock(return_value=result)
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.patch(f"/marketplace/orders/{order.id}/complete")
        assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()


# --- PATCH /marketplace/orders/{order_id}/confirm ---


@pytest.mark.asyncio
async def test_confirm_order_403_non_client() -> None:
    """PATCH /marketplace/orders/{id}/confirm returns 403 for non-client."""
    app = create_app()
    blogger = _make_blogger_user()
    app.dependency_overrides[get_current_user] = lambda: blogger

    async def fake_db():
        session = AsyncMock()
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.patch(f"/marketplace/orders/{uuid.uuid4()}/confirm")
        assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_confirm_order_200_success() -> None:
    """PATCH /marketplace/orders/{id}/confirm transitions to COMPLETED and distributes funds."""
    app = create_app()
    client = _make_client_user()
    blogger = _make_blogger_user()
    order = _make_order(
        client.id, blogger.id, status=MarketplaceOrderStatus.BLOGGER_CONFIRMED.value
    )

    app.dependency_overrides[get_current_user] = lambda: client

    async def fake_db():
        session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=order)
        session.execute = AsyncMock(return_value=result)
        session.commit = AsyncMock()
        session.flush = AsyncMock()
        session.add = MagicMock()

        async def fake_refresh(obj):
            pass

        session.refresh = fake_refresh
        yield session

    app.dependency_overrides[get_db] = fake_db

    with patch(
        "routers.marketplace_orders.marketplace_escrow_service.distribute_funds",
        new_callable=AsyncMock,
    ) as mock_distribute, patch(
        "routers.marketplace_orders.notification_service.notify",
        new_callable=AsyncMock,
    ):
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                r = await ac.patch(f"/marketplace/orders/{order.id}/confirm")
            assert r.status_code == 200
            data = r.json()
            assert data["status"] == "COMPLETED"
            mock_distribute.assert_called_once()
        finally:
            app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_confirm_order_403_wrong_client() -> None:
    """PATCH /marketplace/orders/{id}/confirm returns 403 for non-owner client."""
    app = create_app()
    other_client = _make_client_user()
    blogger = _make_blogger_user()
    order = _make_order(
        uuid.uuid4(), blogger.id, status=MarketplaceOrderStatus.BLOGGER_CONFIRMED.value
    )

    app.dependency_overrides[get_current_user] = lambda: other_client

    async def fake_db():
        session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=order)
        session.execute = AsyncMock(return_value=result)
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.patch(f"/marketplace/orders/{order.id}/confirm")
        assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()
