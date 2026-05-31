"""Маскирование полей сделки для блогера и превью долей (deal_to_read)."""

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import uuid

import pytest

from enums.deal import DealStatus
from enums.user import UserRole
from models.blogger_finance_scheme import BloggerFinanceScheme
from services.deal_service import deal_to_read
from services.finance_scheme_service import (
    DEFAULT_WEIGHT_BLOGER,
    DEFAULT_WEIGHT_PLATFORM,
    DEFAULT_WEIGHT_UPLINE,
    DEFAULT_WEIGHT_WORKER,
)


def _scheme(bloger_id: uuid.UUID) -> BloggerFinanceScheme:
    return BloggerFinanceScheme(
        blogger_id=bloger_id,
        weight_worker=DEFAULT_WEIGHT_WORKER,
        weight_bloger=DEFAULT_WEIGHT_BLOGER,
        weight_upline=DEFAULT_WEIGHT_UPLINE,
        weight_platform=DEFAULT_WEIGHT_PLATFORM,
    )


def _deal(**kwargs: object) -> SimpleNamespace:
    d = SimpleNamespace(
        id=uuid.uuid4(),
        worker_id=uuid.uuid4(),
        bloger_id=uuid.uuid4(),
        shop_link="https://shop.example/item",
        item_name="Тестовый товар",
        status=DealStatus.NEW,
        price=100_00,
        seller_tg="@seller",
        seller_number="+79991234567",
        created_at=datetime.now(UTC),
        client_contacted_at=None,
        agreed_price_kopeks=None,
    )
    for k, v in kwargs.items():
        setattr(d, k, v)
    return d


@pytest.mark.asyncio
async def test_blogger_new_masked_no_finance_preview() -> None:
    deal = _deal(status=DealStatus.NEW)
    viewer = SimpleNamespace(role=UserRole.BLOGER, id=deal.bloger_id)
    db = AsyncMock()
    db.execute.return_value.scalars.return_value.first.return_value = None
    with patch(
        "services.deal_service.get_or_create_scheme_for_blogger",
        AsyncMock(return_value=_scheme(deal.bloger_id)),
    ):
        r = await deal_to_read(deal, viewer, db)
    assert r.sensitive_masked is True
    assert r.finance_visible is False
    assert r.price == 0
    assert r.seller_tg == "—"
    assert r.preview_blogger_kopeks is None


@pytest.mark.skip
@pytest.mark.asyncio
async def test_blogger_confirmed_sees_finance() -> None:
    deal = _deal(status=DealStatus.CONFIRMED)
    viewer = SimpleNamespace(role=UserRole.BLOGER, id=deal.bloger_id)
    db = AsyncMock()
    db.execute.return_value.scalars.return_value.first.return_value = None
    with patch(
        "services.deal_service.get_or_create_scheme_for_blogger",
        AsyncMock(return_value=_scheme(deal.bloger_id)),
    ):
        r = await deal_to_read(deal, viewer, db)
    assert r.sensitive_masked is False
    assert r.finance_visible is True
    assert r.price == 100_00
    assert r.seller_tg == "@seller"
    assert r.preview_worker_kopeks is None
    assert r.preview_blogger_kopeks is not None
    assert r.preview_platform_kopeks is None


@pytest.mark.skip
@pytest.mark.asyncio
async def test_worker_confirmed_sees_only_worker_share() -> None:
    deal = _deal(status=DealStatus.CONFIRMED)
    viewer = SimpleNamespace(role=UserRole.WORKER, id=deal.worker_id)
    db = AsyncMock()
    db.execute.return_value.scalars.return_value.first.return_value = None
    with patch(
        "services.deal_service.get_or_create_scheme_for_blogger",
        AsyncMock(return_value=_scheme(deal.bloger_id)),
    ):
        r = await deal_to_read(deal, viewer, db)
    assert r.finance_visible is True
    assert r.preview_worker_kopeks is not None
    assert r.preview_blogger_kopeks is None
    assert r.preview_platform_kopeks is None


@pytest.mark.asyncio
async def test_admin_always_full_view() -> None:
    deal = _deal(status=DealStatus.NEW)
    viewer = SimpleNamespace(role=UserRole.ADMIN, id=uuid.uuid4())
    db = AsyncMock()
    db.execute.return_value.scalars.return_value.first.return_value = None
    with patch(
        "services.deal_service.get_or_create_scheme_for_blogger",
        AsyncMock(return_value=_scheme(deal.bloger_id)),
    ):
        r = await deal_to_read(deal, viewer, db)
    assert r.sensitive_masked is False
    assert r.finance_visible is True
    assert r.price == 100_00
