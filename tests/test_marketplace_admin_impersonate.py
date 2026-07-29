"""HTTP: POST /admin/marketplace/bloggers/{id}/impersonate (вход от имени автора)."""

import uuid
from unittest.mock import AsyncMock, MagicMock
from urllib.parse import parse_qs, urlparse

import pytest
from httpx import ASGITransport, AsyncClient

from dependencies.auth import get_current_admin_or_tech
from dependencies.database import get_db
from enums.user import UserRole
from main import create_app
from models.blogger_profile import BloggerProfile
from models.user import User
from services.telegram_oauth_store import consume_exchange_ticket
from utils.jwt_tokens import get_user_id_from_payload, verify_access_token


def _make_admin() -> MagicMock:
    admin = MagicMock()
    admin.id = uuid.uuid4()
    admin.name = "Platform"
    admin.role = UserRole.ADMIN
    return admin


def _make_author(*, role: UserRole = UserRole.BLOGER, is_active: bool = True) -> MagicMock:
    user = MagicMock()
    user.id = uuid.uuid4()
    user.name = "Delta"
    user.role = role
    user.is_active = is_active
    return user


def _make_profile(user_id: uuid.UUID) -> MagicMock:
    profile = MagicMock(spec=BloggerProfile)
    profile.id = uuid.uuid4()
    profile.user_id = user_id
    return profile


def _app_with(profile: MagicMock | None, author: MagicMock | None, admin: MagicMock):
    """Приложение с моками: db.get отдаёт профиль по BloggerProfile, автора по User."""
    app = create_app()
    app.dependency_overrides[get_current_admin_or_tech] = lambda: admin
    session = AsyncMock()

    async def getter(model, _pk):
        if model is BloggerProfile:
            return profile
        if model is User:
            return author
        return None

    session.get = AsyncMock(side_effect=getter)
    session.add = MagicMock()

    async def fake_db():
        yield session

    app.dependency_overrides[get_db] = fake_db
    return app, session


@pytest.mark.asyncio
async def test_impersonate_returns_one_time_marketplace_link() -> None:
    admin = _make_admin()
    author = _make_author()
    profile = _make_profile(author.id)
    app, session = _app_with(profile, author, admin)

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(f"/admin/marketplace/bloggers/{profile.id}/impersonate")
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == str(author.id)
    assert body["name"] == "Delta"

    parsed = urlparse(body["url"])
    assert parsed.path == "/auth/platform/callback"
    query = parse_qs(parsed.query)
    assert query["next"] == ["/cabinet"]

    # Код одноразовый: первый обмен отдаёт токены автора, второй — ничего.
    ticket = await consume_exchange_ticket(query["code"][0])
    assert ticket is not None
    assert get_user_id_from_payload(verify_access_token(ticket.access_token)) == author.id
    # Refresh не выдаём: сессию нельзя продлить, она умирает вместе с access-токеном.
    assert ticket.refresh_token == ""
    assert await consume_exchange_ticket(query["code"][0]) is None

    # Вход зафиксирован в журнале аудита пользователя.
    session.add.assert_called_once()
    entry = session.add.call_args.args[0]
    assert entry.actor_id == admin.id
    assert entry.target_user_id == author.id
    assert entry.field == "impersonation"
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_impersonate_404_when_profile_missing() -> None:
    app, _ = _app_with(None, None, _make_admin())
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(f"/admin/marketplace/bloggers/{uuid.uuid4()}/impersonate")
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 404


@pytest.mark.asyncio
async def test_impersonate_403_for_admin_target() -> None:
    author = _make_author(role=UserRole.TECH_ADMIN)
    profile = _make_profile(author.id)
    app, session = _app_with(profile, author, _make_admin())

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(f"/admin/marketplace/bloggers/{profile.id}/impersonate")
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 403
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_impersonate_409_for_banned_author() -> None:
    author = _make_author(is_active=False)
    profile = _make_profile(author.id)
    app, session = _app_with(profile, author, _make_admin())

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(f"/admin/marketplace/bloggers/{profile.id}/impersonate")
    finally:
        app.dependency_overrides.clear()

    # Токен забаненного всё равно отвергнет get_current_user — говорим об этом сразу.
    assert r.status_code == 409
    session.add.assert_not_called()
