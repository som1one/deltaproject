"""HTTP: Client Auth Router (/marketplace/auth)."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from dependencies.database import get_db
from enums.user import UserRole
from main import create_app
from utils.security import hash_password


def _make_client_user(
    email: str = "client@example.com",
    name: str = "Test Client",
    is_active: bool = True,
    marketplace_referred_by: uuid.UUID | None = None,
) -> MagicMock:
    user = MagicMock()
    user.id = uuid.uuid4()
    user.name = name
    user.email = email
    user.hash_pass = hash_password("securepass123")
    user.role = UserRole.CLIENT
    user.is_active = is_active
    user.marketplace_referred_by = marketplace_referred_by
    return user


@pytest.mark.asyncio
async def test_register_success() -> None:
    """POST /marketplace/auth/register creates a new client and returns tokens."""
    app = create_app()

    async def fake_db():
        session = AsyncMock()
        # email uniqueness check returns None (no existing user)
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=None)
        session.execute = AsyncMock(return_value=result)
        session.add = MagicMock()
        session.flush = AsyncMock()
        session.commit = AsyncMock()

        async def fake_refresh(obj):
            obj.id = uuid.uuid4()

        session.refresh = fake_refresh
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/auth/register",
                json={
                    "name": "New Client",
                    "email": "newclient@example.com",
                    "password": "securepass123",
                },
            )
        assert r.status_code == 201
        data = r.json()
        assert data["token"]
        assert data["refresh_token"]
        assert "message" in data
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_register_duplicate_email_409() -> None:
    """POST /marketplace/auth/register returns 409 for duplicate email."""
    app = create_app()
    existing = _make_client_user(email="taken@example.com")

    async def fake_db():
        session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=existing)
        session.execute = AsyncMock(return_value=result)
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/auth/register",
                json={
                    "name": "Another Client",
                    "email": "taken@example.com",
                    "password": "securepass123",
                },
            )
        assert r.status_code == 409
        assert "email" in r.json()["detail"].lower() or "существует" in r.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_register_invalid_short_password_422() -> None:
    """POST /marketplace/auth/register returns 422 for password < 8 chars."""
    app = create_app()

    async def fake_db():
        session = AsyncMock()
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/auth/register",
                json={
                    "name": "Client",
                    "email": "client@example.com",
                    "password": "short",  # < 8 chars
                },
            )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_register_invalid_email_422() -> None:
    """POST /marketplace/auth/register returns 422 for invalid email format."""
    app = create_app()

    async def fake_db():
        session = AsyncMock()
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/auth/register",
                json={
                    "name": "Client",
                    "email": "not-an-email",
                    "password": "securepass123",
                },
            )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_register_empty_name_422() -> None:
    """POST /marketplace/auth/register returns 422 for empty name."""
    app = create_app()

    async def fake_db():
        session = AsyncMock()
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/auth/register",
                json={
                    "name": "",
                    "email": "client@example.com",
                    "password": "securepass123",
                },
            )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_register_with_valid_referral() -> None:
    """POST /marketplace/auth/register with valid referral code associates worker."""
    app = create_app()
    worker_id = uuid.uuid4()

    async def fake_db():
        session = AsyncMock()
        # email uniqueness check returns None
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=None)
        session.execute = AsyncMock(return_value=result)
        session.add = MagicMock()
        session.flush = AsyncMock()
        session.commit = AsyncMock()

        async def fake_refresh(obj):
            obj.id = uuid.uuid4()

        session.refresh = fake_refresh
        yield session

    app.dependency_overrides[get_db] = fake_db

    with patch(
        "routers.marketplace_auth.resolve_referral",
        new=AsyncMock(return_value=worker_id),
    ), patch(
        "routers.marketplace_auth.assign_referral",
        new=AsyncMock(return_value=None),
    ):
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                r = await ac.post(
                    "/marketplace/auth/register",
                    json={
                        "name": "Referred Client",
                        "email": "referred@example.com",
                        "password": "securepass123",
                        "referral_code": "abc123",
                    },
                )
            assert r.status_code == 201
            data = r.json()
            assert data["token"]
        finally:
            app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_register_with_invalid_referral_still_succeeds() -> None:
    """POST /marketplace/auth/register with invalid referral code still creates account."""
    app = create_app()

    async def fake_db():
        session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=None)
        session.execute = AsyncMock(return_value=result)
        session.add = MagicMock()
        session.flush = AsyncMock()
        session.commit = AsyncMock()

        async def fake_refresh(obj):
            obj.id = uuid.uuid4()

        session.refresh = fake_refresh
        yield session

    app.dependency_overrides[get_db] = fake_db

    with patch(
        "routers.marketplace_auth.resolve_referral",
        new=AsyncMock(return_value=None),
    ):
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                r = await ac.post(
                    "/marketplace/auth/register",
                    json={
                        "name": "Client No Ref",
                        "email": "noref@example.com",
                        "password": "securepass123",
                        "referral_code": "invalid_code",
                    },
                )
            assert r.status_code == 201
        finally:
            app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_login_success() -> None:
    """POST /marketplace/auth/login returns tokens for valid credentials."""
    app = create_app()
    user = _make_client_user()

    async def fake_db():
        session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=user)
        session.execute = AsyncMock(return_value=result)
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/auth/login",
                json={
                    "email": "client@example.com",
                    "password": "securepass123",
                },
            )
        assert r.status_code == 200
        data = r.json()
        assert data["token"]
        assert data["refresh_token"]
        assert "message" in data
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_login_invalid_credentials_401() -> None:
    """POST /marketplace/auth/login returns 401 for wrong password."""
    app = create_app()
    user = _make_client_user()

    async def fake_db():
        session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=user)
        session.execute = AsyncMock(return_value=result)
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/auth/login",
                json={
                    "email": "client@example.com",
                    "password": "wrongpassword",
                },
            )
        assert r.status_code == 401
        assert "email" in r.json()["detail"].lower() or "пароль" in r.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_login_nonexistent_user_401() -> None:
    """POST /marketplace/auth/login returns 401 for non-existent email."""
    app = create_app()

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
                "/marketplace/auth/login",
                json={
                    "email": "nobody@example.com",
                    "password": "securepass123",
                },
            )
        assert r.status_code == 401
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_login_inactive_account_403() -> None:
    """POST /marketplace/auth/login returns 403 for inactive account."""
    app = create_app()
    user = _make_client_user(is_active=False)

    async def fake_db():
        session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=user)
        session.execute = AsyncMock(return_value=result)
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/auth/login",
                json={
                    "email": "client@example.com",
                    "password": "securepass123",
                },
            )
        assert r.status_code == 403
        assert "деактивирован" in r.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_refresh_success() -> None:
    """POST /marketplace/auth/refresh returns new token pair."""
    app = create_app()
    user = _make_client_user()

    # Create a real refresh token for the user
    from utils.jwt_tokens import create_refresh_token

    valid_refresh = create_refresh_token(user.id)

    async def fake_db():
        session = AsyncMock()
        session.get = AsyncMock(return_value=user)
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/auth/refresh",
                json={"refresh_token": valid_refresh},
            )
        assert r.status_code == 200
        data = r.json()
        assert data["token"]
        assert data["refresh_token"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_refresh_invalid_token_401() -> None:
    """POST /marketplace/auth/refresh returns 401 for invalid token."""
    app = create_app()

    async def fake_db():
        session = AsyncMock()
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/auth/refresh",
                json={"refresh_token": "invalid.token.here"},
            )
        assert r.status_code == 401
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_refresh_inactive_user_403() -> None:
    """POST /marketplace/auth/refresh returns 403 for inactive user."""
    app = create_app()
    user = _make_client_user(is_active=False)

    from utils.jwt_tokens import create_refresh_token

    valid_refresh = create_refresh_token(user.id)

    async def fake_db():
        session = AsyncMock()
        session.get = AsyncMock(return_value=user)
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/auth/refresh",
                json={"refresh_token": valid_refresh},
            )
        assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()
