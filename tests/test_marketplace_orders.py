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
    order.payment_reported_at = None
    # Полный цикл: услуга, оффер, сроки, сдача работы, окно приёмки
    order.service_type_id = None
    order.service_type_name = None
    order.offered_by = client_id
    order.deadline_days = None
    order.publish_at = None
    order.accepted_at = None
    order.deadline_at = None
    order.work_submitted_at = None
    order.work_result = None
    order.review_deadline_at = None
    order.decline_reason = None
    order.blogger_confirmed_at = None
    order.created_at = datetime.now(timezone.utc)
    order.paid_at = None
    order.completed_at = None
    order.updated_at = datetime.now(timezone.utc)
    return order


# --- POST /marketplace/orders ---


@pytest.mark.asyncio
async def test_create_order_201_success() -> None:
    """POST /marketplace/orders creates an offer (OFFER_PENDING) for client."""
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
                # User (клиент) lookup
                result.scalar_one_or_none = MagicMock(return_value=client)
            elif call_count["n"] == 3:
                # User (автор — проверка is_active) lookup
                result.scalar_one_or_none = MagicMock(return_value=blogger)
            elif call_count["n"] == 4:
                # MarketplaceSettings lookup
                result.scalar_one_or_none = MagicMock(return_value=settings)
            else:
                # send_message: User (получатель оффера — блогер) lookup
                result.scalar_one_or_none = MagicMock(return_value=blogger)
            return result

        session.execute = mock_execute
        session.add = MagicMock()
        session.flush = AsyncMock()
        session.commit = AsyncMock()

        async def fake_refresh(obj):
            # Симуляция полей, заполняемых БД; остальное ставит create_offer
            obj.id = uuid.uuid4()
            obj.created_at = datetime.now(timezone.utc)
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
        assert data["status"] == "OFFER_PENDING"
        assert data["amount_kopeks"] == 500000
        assert data["offered_by"] == str(client.id)
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
async def test_create_order_400_blogger_not_found() -> None:
    """POST /marketplace/orders returns 400 (OrderFlowError) if blogger profile not found."""
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
        assert r.status_code == 400
        assert "не найден" in r.json()["detail"]
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
        assert "скрыл карточку" in r.json()["detail"]
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
        assert "приостановил" in r.json()["detail"]
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
            elif call_count["n"] == 2:
                # Items query
                scalars_mock = MagicMock()
                scalars_mock.all = MagicMock(return_value=[order])
                result.scalars = MagicMock(return_value=scalars_mock)
            else:
                # Имена сторон (client/blogger)
                result.all = MagicMock(return_value=[])
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
        assert "mark_paid" in data["available_actions"]
        # Отзывы появляются только в COMPLETED
        assert data["my_review"] is None
        assert data["review_of_me"] is None
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


# --- PATCH /marketplace/orders/{order_id}/submit-work ---


@pytest.mark.asyncio
async def test_submit_work_403_non_blogger() -> None:
    """PATCH /marketplace/orders/{id}/submit-work returns 403 for non-blogger."""
    app = create_app()
    client = _make_client_user()
    app.dependency_overrides[get_current_user] = lambda: client

    async def fake_db():
        session = AsyncMock()
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.patch(
                f"/marketplace/orders/{uuid.uuid4()}/submit-work",
                json={"result": "https://example.com/post"},
            )
        assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_submit_work_200_success() -> None:
    """PATCH /marketplace/orders/{id}/submit-work transitions to BLOGGER_CONFIRMED."""
    app = create_app()
    blogger = _make_blogger_user()
    client = _make_client_user()
    order = _make_order(client.id, blogger.id, status=MarketplaceOrderStatus.ESCROW_HELD.value)

    app.dependency_overrides[get_current_user] = lambda: blogger

    async def fake_db():
        session = AsyncMock()
        order_result = MagicMock()
        order_result.scalar_one_or_none = MagicMock(return_value=order)
        # send_message (system) грузит получателя — клиента
        recipient_result = MagicMock()
        recipient_result.scalar_one_or_none = MagicMock(return_value=client)
        session.execute = AsyncMock(side_effect=[order_result, recipient_result])
        session.add = MagicMock()
        session.flush = AsyncMock()
        session.commit = AsyncMock()

        async def fake_refresh(obj):
            pass  # submit_work уже поставил статус и таймстемпы

        session.refresh = fake_refresh
        yield session

    app.dependency_overrides[get_db] = fake_db

    with patch(
        "services.marketplace_order_flow_service.notification_service.notify",
        new_callable=AsyncMock,
    ) as mock_notify:
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                r = await ac.patch(
                    f"/marketplace/orders/{order.id}/submit-work",
                    json={"result": "https://example.com/post"},
                )
            assert r.status_code == 200
            data = r.json()
            assert data["status"] == "BLOGGER_CONFIRMED"
            assert data["work_result"] == "https://example.com/post"
            assert data["work_submitted_at"] is not None
            assert data["review_deadline_at"] is not None
            mock_notify.assert_called_once()
            call_kwargs = mock_notify.call_args.kwargs
            assert call_kwargs["user_id"] == client.id
            assert call_kwargs["event_type"] == "work_submitted"
            assert call_kwargs["payload"]["order_id"] == str(order.id)
            assert call_kwargs["payload"]["blogger_name"] == blogger.name
        finally:
            app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_submit_work_403_wrong_blogger() -> None:
    """PATCH /marketplace/orders/{id}/submit-work returns 403 for non-assigned blogger."""
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
            r = await ac.patch(
                f"/marketplace/orders/{order.id}/submit-work",
                json={"result": "https://example.com/post"},
            )
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
        order_result = MagicMock()
        order_result.scalar_one_or_none = MagicMock(return_value=order)
        # send_system_message → send_message грузит получателя — блогера
        recipient_result = MagicMock()
        recipient_result.scalar_one_or_none = MagicMock(return_value=blogger)
        session.execute = AsyncMock(side_effect=[order_result, recipient_result])
        session.commit = AsyncMock()
        session.flush = AsyncMock()
        session.add = MagicMock()

        async def fake_refresh(obj):
            pass

        session.refresh = fake_refresh
        yield session

    app.dependency_overrides[get_db] = fake_db

    with patch(
        "services.marketplace_escrow_service.distribute_funds",
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


# --- PATCH /marketplace/orders/{id}/retry-payment ---


@pytest.mark.asyncio
async def test_retry_payment_200_returns_to_pending() -> None:
    """PAYMENT_FAILED → PENDING_PAYMENT для клиента-владельца; след прошлой попытки сброшен."""
    app = create_app()
    client = _make_client_user()
    blogger = _make_blogger_user()
    order = _make_order(
        client.id, blogger.id, status=MarketplaceOrderStatus.PAYMENT_FAILED.value
    )
    order.yookassa_payment_id = "pay_old"
    order.payment_url = "https://old"
    order.payment_reported_at = datetime.now(timezone.utc)

    app.dependency_overrides[get_current_user] = lambda: client

    async def fake_db():
        session = AsyncMock()
        order_result = MagicMock()
        order_result.scalar_one_or_none = MagicMock(return_value=order)
        session.execute = AsyncMock(side_effect=[order_result])
        session.commit = AsyncMock()
        session.flush = AsyncMock()
        session.add = MagicMock()

        async def fake_refresh(obj):
            pass

        session.refresh = fake_refresh
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.patch(f"/marketplace/orders/{order.id}/retry-payment")
        assert r.status_code == 200
        assert r.json()["status"] == "PENDING_PAYMENT"
        assert order.yookassa_payment_id is None
        assert order.payment_url is None
        assert order.payment_reported_at is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_retry_payment_400_wrong_status() -> None:
    """retry-payment для заказа не в PAYMENT_FAILED → 400."""
    app = create_app()
    client = _make_client_user()
    blogger = _make_blogger_user()
    order = _make_order(
        client.id, blogger.id, status=MarketplaceOrderStatus.PENDING_PAYMENT.value
    )

    app.dependency_overrides[get_current_user] = lambda: client

    async def fake_db():
        session = AsyncMock()
        order_result = MagicMock()
        order_result.scalar_one_or_none = MagicMock(return_value=order)
        session.execute = AsyncMock(side_effect=[order_result])
        session.commit = AsyncMock()
        session.flush = AsyncMock()
        session.add = MagicMock()
        session.refresh = AsyncMock()
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.patch(f"/marketplace/orders/{order.id}/retry-payment")
        assert r.status_code == 400
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_retry_payment_403_non_client() -> None:
    """Не-клиент не может повторить оплату."""
    app = create_app()
    blogger = _make_blogger_user()
    order = _make_order(
        uuid.uuid4(), blogger.id, status=MarketplaceOrderStatus.PAYMENT_FAILED.value
    )

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
            r = await ac.patch(f"/marketplace/orders/{order.id}/retry-payment")
        assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()
