"""HTTP: Blogger Profile Router (/marketplace/blogger/profile)."""

import uuid
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from dependencies.auth import get_current_blogger
from dependencies.database import get_db
from enums.marketplace import BloggerCategory
from enums.user import UserRole
from main import create_app
from models.blogger_profile import BloggerProfile


def _make_blogger_user() -> MagicMock:
    user = MagicMock()
    user.id = uuid.uuid4()
    user.name = "Test Blogger"
    user.role = UserRole.BLOGER
    user.is_active = True
    return user


def _make_profile(user_id: uuid.UUID) -> BloggerProfile:
    profile = MagicMock(spec=BloggerProfile)
    profile.id = uuid.uuid4()
    profile.user_id = user_id
    profile.category = BloggerCategory.TECH.value
    profile.subscriber_count = 50000
    profile.average_price_kopeks = 500000
    profile.description = "Тестовый блогер"
    profile.portfolio_links = ["https://example.com/portfolio"]
    profile.social_links = ["https://instagram.com/test"]
    profile.photo_url = None
    profile.preferred_contact = "telegram"
    profile.is_active = True
    profile.orders_enabled = True
    profile.created_at = datetime.now(timezone.utc)
    profile.updated_at = datetime.now(timezone.utc)
    return profile


@pytest.mark.asyncio
async def test_get_profile_404_when_not_exists() -> None:
    """GET /marketplace/blogger/profile returns 404 if profile not created."""
    app = create_app()
    blogger = _make_blogger_user()
    app.dependency_overrides[get_current_blogger] = lambda: blogger

    async def fake_db():
        session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=None)
        session.execute = AsyncMock(return_value=result)
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get("/marketplace/blogger/profile")
        assert r.status_code == 404
        assert "не заполнен" in r.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_profile_200_when_exists() -> None:
    """GET /marketplace/blogger/profile returns profile data."""
    app = create_app()
    blogger = _make_blogger_user()
    profile = _make_profile(blogger.id)
    app.dependency_overrides[get_current_blogger] = lambda: blogger

    async def fake_db():
        session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=profile)
        session.execute = AsyncMock(return_value=result)
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get("/marketplace/blogger/profile")
        assert r.status_code == 200
        data = r.json()
        assert data["subscriber_count"] == 50000
        assert data["category"] == "tech"
        assert data["description"] == "Тестовый блогер"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_profile_201_success() -> None:
    """POST /marketplace/blogger/profile creates a new profile."""
    app = create_app()
    blogger = _make_blogger_user()
    app.dependency_overrides[get_current_blogger] = lambda: blogger

    created_profile = _make_profile(blogger.id)

    async def fake_db():
        session = AsyncMock()
        # First call: check existing (returns None)
        # Second call would be after commit/refresh
        result_none = MagicMock()
        result_none.scalar_one_or_none = MagicMock(return_value=None)
        session.execute = AsyncMock(return_value=result_none)
        session.add = MagicMock()
        session.commit = AsyncMock()

        async def fake_refresh(obj):
            # Simulate DB filling in fields after commit
            obj.id = created_profile.id
            obj.is_active = True
            obj.orders_enabled = True
            obj.created_at = created_profile.created_at
            obj.updated_at = created_profile.updated_at

        session.refresh = fake_refresh
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/blogger/profile",
                json={
                    "category": "tech",
                    "subscriber_count": 50000,
                    "average_price_kopeks": 500000,
                    "description": "Тестовый блогер",
                    "social_links": ["https://instagram.com/test"],
                    "portfolio_links": ["https://example.com/portfolio"],
                },
            )
        assert r.status_code == 201
        data = r.json()
        assert data["category"] == "tech"
        assert data["subscriber_count"] == 50000
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_profile_409_already_exists() -> None:
    """POST /marketplace/blogger/profile returns 409 if profile already exists."""
    app = create_app()
    blogger = _make_blogger_user()
    profile = _make_profile(blogger.id)
    app.dependency_overrides[get_current_blogger] = lambda: blogger

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
                "/marketplace/blogger/profile",
                json={
                    "category": "tech",
                    "subscriber_count": 50000,
                    "average_price_kopeks": 500000,
                    "description": "Тестовый блогер",
                    "social_links": ["https://instagram.com/test"],
                },
            )
        assert r.status_code == 409
        assert "уже существует" in r.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_profile_422_invalid_data() -> None:
    """POST /marketplace/blogger/profile returns 422 for invalid data."""
    app = create_app()
    blogger = _make_blogger_user()
    app.dependency_overrides[get_current_blogger] = lambda: blogger

    async def fake_db():
        session = AsyncMock()
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # Missing required fields, invalid subscriber_count
            r = await ac.post(
                "/marketplace/blogger/profile",
                json={
                    "category": "tech",
                    "subscriber_count": 0,  # must be >= 1
                    "average_price_kopeks": 500000,
                    "description": "Test",
                    "social_links": ["https://instagram.com/test"],
                },
            )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_profile_422_empty_social_links() -> None:
    """POST /marketplace/blogger/profile returns 422 when social_links is empty."""
    app = create_app()
    blogger = _make_blogger_user()
    app.dependency_overrides[get_current_blogger] = lambda: blogger

    async def fake_db():
        session = AsyncMock()
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/marketplace/blogger/profile",
                json={
                    "category": "tech",
                    "subscriber_count": 1000,
                    "average_price_kopeks": 500000,
                    "description": "Test",
                    "social_links": [],  # must have at least 1
                },
            )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_patch_profile_200_success() -> None:
    """PATCH /marketplace/blogger/profile updates fields."""
    app = create_app()
    blogger = _make_blogger_user()
    profile = _make_profile(blogger.id)
    app.dependency_overrides[get_current_blogger] = lambda: blogger

    async def fake_db():
        session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=profile)
        session.execute = AsyncMock(return_value=result)
        session.commit = AsyncMock()

        async def fake_refresh(obj):
            pass  # profile already has updated values

        session.refresh = fake_refresh
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.patch(
                "/marketplace/blogger/profile",
                json={"description": "Обновлённое описание"},
            )
        assert r.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_patch_profile_404_when_not_exists() -> None:
    """PATCH /marketplace/blogger/profile returns 404 if profile not created."""
    app = create_app()
    blogger = _make_blogger_user()
    app.dependency_overrides[get_current_blogger] = lambda: blogger

    async def fake_db():
        session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=None)
        session.execute = AsyncMock(return_value=result)
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.patch(
                "/marketplace/blogger/profile",
                json={"description": "Обновлённое описание"},
            )
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()
