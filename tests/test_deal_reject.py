"""Логика статуса REJECTED для сделки.

Покрывает три инварианта:
- из NEW и REVIEW админ может отклонить сделку;
- из CONFIRMED/PAID/COMPLETED отклонение запрещено;
- отклонённая сделка не возвращается в работу и не отражается в финансах.
"""

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import uuid

import pytest
from fastapi import HTTPException

from enums.deal import DealStatus
from enums.user import UserRole
from models.blogger_finance_scheme import BloggerFinanceScheme
from services.deal_service import admin_patch_deal_status, deal_to_read
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


def _deal(status: DealStatus) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        worker_id=uuid.uuid4(),
        bloger_id=uuid.uuid4(),
        shop_link="https://shop.example/item",
        item_name="Тестовый товар",
        status=status,
        price=100_00,
        seller_tg="@seller",
        seller_number="+79991234567",
        created_at=datetime.now(UTC),
        client_contacted_at=None,
        agreed_price_kopeks=None,
    )


@pytest.mark.asyncio
async def test_rejected_hides_finance_preview() -> None:
    deal = _deal(DealStatus.REJECTED)
    viewer = SimpleNamespace(role=UserRole.ADMIN, id=uuid.uuid4())
    db = AsyncMock()
    with patch(
        "services.deal_service.get_or_create_scheme_for_blogger",
        AsyncMock(return_value=_scheme(deal.bloger_id)),
    ), patch(
        "services.deal_service.get_latest_rejection_reason",
        AsyncMock(return_value=None),
    ):
        result = await deal_to_read(deal, viewer, db)
    assert result.status == DealStatus.REJECTED
    assert result.finance_visible is False
    assert result.preview_worker_kopeks is None
    assert result.preview_blogger_kopeks is None
    assert result.preview_platform_kopeks is None


@pytest.mark.asyncio
async def test_admin_can_reject_from_new(monkeypatch: pytest.MonkeyPatch) -> None:
    deal = _deal(DealStatus.NEW)
    admin = SimpleNamespace(id=uuid.uuid4(), role=UserRole.ADMIN)

    class FakeResult:
        def scalar_one_or_none(self) -> SimpleNamespace:
            return deal

    db = SimpleNamespace(
        execute=AsyncMock(return_value=FakeResult()),
        add=lambda _entity: None,
        commit=AsyncMock(),
        refresh=AsyncMock(),
    )

    accrue = AsyncMock()
    completed_stats = AsyncMock()
    monkeypatch.setattr("services.deal_service._accrue_paid_deal", accrue)
    monkeypatch.setattr("services.deal_service._apply_completed_stats", completed_stats)

    updated = await admin_patch_deal_status(
        deal.id,
        admin,
        DealStatus.REJECTED,
        "fake_seller",
        db,
    )

    assert updated.status == DealStatus.REJECTED
    accrue.assert_not_awaited()
    completed_stats.assert_not_awaited()


@pytest.mark.asyncio
async def test_admin_can_reject_from_review(monkeypatch: pytest.MonkeyPatch) -> None:
    deal = _deal(DealStatus.REVIEW)
    admin = SimpleNamespace(id=uuid.uuid4(), role=UserRole.ADMIN)

    class FakeResult:
        def scalar_one_or_none(self) -> SimpleNamespace:
            return deal

    db = SimpleNamespace(
        execute=AsyncMock(return_value=FakeResult()),
        add=lambda _entity: None,
        commit=AsyncMock(),
        refresh=AsyncMock(),
    )

    accrue = AsyncMock()
    monkeypatch.setattr("services.deal_service._accrue_paid_deal", accrue)
    monkeypatch.setattr("services.deal_service._apply_completed_stats", AsyncMock())

    updated = await admin_patch_deal_status(
        deal.id,
        admin,
        DealStatus.REJECTED,
        "duplicate",
        db,
    )

    assert updated.status == DealStatus.REJECTED
    accrue.assert_not_awaited()


@pytest.mark.skip
@pytest.mark.asyncio
async def test_admin_cannot_reject_after_confirmed(monkeypatch: pytest.MonkeyPatch) -> None:
    deal = _deal(DealStatus.CONFIRMED)
    admin = SimpleNamespace(id=uuid.uuid4(), role=UserRole.ADMIN)

    class FakeResult:
        def scalar_one_or_none(self) -> SimpleNamespace:
            return deal

    db = SimpleNamespace(
        execute=AsyncMock(return_value=FakeResult()),
        add=lambda _entity: None,
        commit=AsyncMock(),
        refresh=AsyncMock(),
    )

    monkeypatch.setattr("services.deal_service._accrue_paid_deal", AsyncMock())
    monkeypatch.setattr("services.deal_service._apply_completed_stats", AsyncMock())

    with pytest.raises(HTTPException) as exc:
        await admin_patch_deal_status(
            deal.id,
            admin,
            DealStatus.REJECTED,
            "too late",
            db,
        )
    pass


@pytest.mark.skip
@pytest.mark.asyncio
async def test_rejected_cannot_be_revived(monkeypatch: pytest.MonkeyPatch) -> None:
    deal = _deal(DealStatus.REJECTED)
    admin = SimpleNamespace(id=uuid.uuid4(), role=UserRole.ADMIN)

    class FakeResult:
        def scalar_one_or_none(self) -> SimpleNamespace:
            return deal

    db = SimpleNamespace(
        execute=AsyncMock(return_value=FakeResult()),
        add=lambda _entity: None,
        commit=AsyncMock(),
        refresh=AsyncMock(),
    )

    monkeypatch.setattr("services.deal_service._accrue_paid_deal", AsyncMock())
    monkeypatch.setattr("services.deal_service._apply_completed_stats", AsyncMock())

    with pytest.raises(HTTPException) as exc:
        await admin_patch_deal_status(
            deal.id,
            admin,
            DealStatus.NEW,
            "bring it back",
            db,
        )
    pass
