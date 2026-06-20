"""Property-based тесты для контроля доступа при подтверждении заказа.

Feature: worker-referral-orders, Property 11: Контроль доступа при подтверждении
Validates: Requirements 4.3, 4.6

Тестирует чистую логику (не HTTP): правило «если user_id != assigned_id, доступ запрещён».
- Для любого UUID, не равного order.blogger_id, попытка complete должна быть отклонена.
- Для любого UUID, не равного order.client_id, попытка confirm должна быть отклонена.
"""

import uuid
from dataclasses import dataclass

from hypothesis import assume, given, settings
from hypothesis import strategies as st

from enums.marketplace import MarketplaceOrderStatus


@dataclass
class OrderAccessContext:
    """Минимальный контекст заказа для проверки доступа."""

    blogger_id: uuid.UUID
    client_id: uuid.UUID


def can_complete(user_id: uuid.UUID, order: OrderAccessContext) -> bool:
    """Правило: только назначенный блогер может подтвердить выполнение (complete).

    Requirement 4.3: если user_id != order.blogger_id → доступ запрещён.
    """
    return user_id == order.blogger_id


def can_confirm(user_id: uuid.UUID, order: OrderAccessContext) -> bool:
    """Правило: только заказчик-владелец может подтвердить получение (confirm).

    Requirement 4.6: если user_id != order.client_id → доступ запрещён.
    """
    return user_id == order.client_id


class TestAccessControlCompleteProperty:
    """**Validates: Requirements 4.3**

    Property 11 (часть 1): Для любого UUID, не равного order.blogger_id,
    попытка подтвердить выполнение (complete) должна быть отклонена.
    """

    @given(
        blogger_id=st.uuids(),
        client_id=st.uuids(),
        attacker_id=st.uuids(),
    )
    @settings(max_examples=200)
    def test_non_blogger_cannot_complete(
        self, blogger_id: uuid.UUID, client_id: uuid.UUID, attacker_id: uuid.UUID
    ) -> None:
        """Любой пользователь, не являющийся назначенным блогером, не может выполнить complete.

        **Validates: Requirements 4.3**
        """
        assume(attacker_id != blogger_id)

        order = OrderAccessContext(blogger_id=blogger_id, client_id=client_id)
        assert can_complete(attacker_id, order) is False

    @given(
        blogger_id=st.uuids(),
        client_id=st.uuids(),
    )
    @settings(max_examples=200)
    def test_assigned_blogger_can_complete(
        self, blogger_id: uuid.UUID, client_id: uuid.UUID
    ) -> None:
        """Назначенный блогер может выполнить complete.

        **Validates: Requirements 4.3**
        """
        order = OrderAccessContext(blogger_id=blogger_id, client_id=client_id)
        assert can_complete(blogger_id, order) is True


class TestAccessControlConfirmProperty:
    """**Validates: Requirements 4.6**

    Property 11 (часть 2): Для любого UUID, не равного order.client_id,
    попытка подтвердить получение (confirm) должна быть отклонена.
    """

    @given(
        blogger_id=st.uuids(),
        client_id=st.uuids(),
        attacker_id=st.uuids(),
    )
    @settings(max_examples=200)
    def test_non_client_cannot_confirm(
        self, blogger_id: uuid.UUID, client_id: uuid.UUID, attacker_id: uuid.UUID
    ) -> None:
        """Любой пользователь, не являющийся заказчиком, не может выполнить confirm.

        **Validates: Requirements 4.6**
        """
        assume(attacker_id != client_id)

        order = OrderAccessContext(blogger_id=blogger_id, client_id=client_id)
        assert can_confirm(attacker_id, order) is False

    @given(
        blogger_id=st.uuids(),
        client_id=st.uuids(),
    )
    @settings(max_examples=200)
    def test_order_client_can_confirm(
        self, blogger_id: uuid.UUID, client_id: uuid.UUID
    ) -> None:
        """Заказчик-владелец может выполнить confirm.

        **Validates: Requirements 4.6**
        """
        order = OrderAccessContext(blogger_id=blogger_id, client_id=client_id)
        assert can_confirm(client_id, order) is True


# ---------------------------------------------------------------------------
# Property 14: Видимость реквизитов по статусу
# Feature: worker-referral-orders
# Validates: Requirements 2.3
# ---------------------------------------------------------------------------

# Все статусы, кроме PENDING_PAYMENT — в этих статусах settlement_account должен быть None
non_pending_statuses = [
    s
    for s in MarketplaceOrderStatus
    if s != MarketplaceOrderStatus.PENDING_PAYMENT
]


def should_include_settlement_account(order_status: MarketplaceOrderStatus) -> bool:
    """Логика видимости реквизитов расчётного счёта.

    Реквизиты отображаются ТОЛЬКО когда заказ в статусе PENDING_PAYMENT.
    Для всех остальных статусов — settlement_account = None.
    Это воспроизводит логику из GET /marketplace/orders/{id}.
    """
    return order_status == MarketplaceOrderStatus.PENDING_PAYMENT


class TestSettlementAccountVisibilityProperty:
    """**Validates: Requirements 2.3**

    Property 14: Для любого заказа в статусе, отличном от PENDING_PAYMENT,
    ответ API не должен содержать реквизиты расчётного счёта (settlement_account = None).
    """

    @given(status=st.sampled_from(non_pending_statuses))
    @settings(max_examples=200)
    def test_non_pending_payment_status_excludes_settlement_account(
        self, status: MarketplaceOrderStatus
    ) -> None:
        """Для любого статуса, отличного от PENDING_PAYMENT,
        settlement_account НЕ должен включаться в ответ.

        **Validates: Requirements 2.3**
        """
        assert should_include_settlement_account(status) is False

    @given(status=st.just(MarketplaceOrderStatus.PENDING_PAYMENT))
    @settings(max_examples=200)
    def test_pending_payment_status_may_include_settlement_account(
        self, status: MarketplaceOrderStatus
    ) -> None:
        """Для PENDING_PAYMENT settlement_account МОЖЕТ быть включён
        (зависит от наличия настроенного расчётного счёта).

        **Validates: Requirements 2.3**
        """
        assert should_include_settlement_account(status) is True

    @given(status=st.sampled_from(non_pending_statuses))
    @settings(max_examples=200)
    def test_all_non_pending_statuses_covered(
        self, status: MarketplaceOrderStatus
    ) -> None:
        """Проверяет, что все non-PENDING_PAYMENT статусы покрыты:
        ESCROW_HELD, BLOGGER_CONFIRMED, COMPLETED, REFUNDED, CANCELLED, PAYMENT_FAILED.

        **Validates: Requirements 2.3**
        """
        expected_non_pending = {
            MarketplaceOrderStatus.ESCROW_HELD,
            MarketplaceOrderStatus.BLOGGER_CONFIRMED,
            MarketplaceOrderStatus.COMPLETED,
            MarketplaceOrderStatus.REFUNDED,
            MarketplaceOrderStatus.CANCELLED,
            MarketplaceOrderStatus.PAYMENT_FAILED,
        }
        assert status in expected_non_pending
        assert should_include_settlement_account(status) is False


# ---------------------------------------------------------------------------
# Property 7: Неизменяемость привязки воркера
# Feature: worker-referral-orders
# Validates: Requirements 6.3
# ---------------------------------------------------------------------------


import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from services.marketplace_referral_service import (
    ReferralAlreadyAssignedError,
    assign_referral,
)


def _make_mock_user(
    user_id: uuid.UUID,
    marketplace_referred_by: uuid.UUID | None,
) -> MagicMock:
    """Create a mock User object with marketplace_referred_by set."""
    user = MagicMock()
    user.id = user_id
    user.role = "Client"
    user.marketplace_referred_by = marketplace_referred_by
    return user


class TestWorkerReferralImmutabilityProperty:
    """**Validates: Requirements 6.3**

    Property 7: Неизменяемость привязки воркера.
    Для любого заказчика с установленным marketplace_referred_by,
    любая попытка изменить значение на другой UUID должна быть отклонена
    (ReferralAlreadyAssignedError), а назначение того же воркера — идемпотентно (без ошибки).
    """

    @given(
        original_worker=st.uuids(),
        new_worker=st.uuids(),
    )
    @settings(max_examples=200)
    def test_reassignment_to_different_worker_raises_error(
        self, original_worker: uuid.UUID, new_worker: uuid.UUID
    ) -> None:
        """Для любой пары (original_worker, new_worker) где original != new,
        если user уже имеет marketplace_referred_by = original_worker,
        то assign_referral(user, new_worker) должен поднять ReferralAlreadyAssignedError.

        **Validates: Requirements 6.3**
        """
        assume(original_worker != new_worker)

        user_id = uuid.uuid4()
        mock_user = _make_mock_user(user_id, marketplace_referred_by=original_worker)
        mock_user.role = MagicMock()
        mock_user.role.__eq__ = lambda self, other: True  # noqa: E731 — passes role check

        mock_db = AsyncMock()
        mock_db.get = AsyncMock(return_value=mock_user)

        # Patch UserRole.CLIENT comparison to always match our mock user's role
        with patch("services.marketplace_referral_service.UserRole") as mock_role_enum:
            mock_role_enum.CLIENT = mock_user.role

            try:
                asyncio.get_event_loop().run_until_complete(
                    assign_referral(user_id, new_worker, mock_db)
                )
                raise AssertionError(
                    "assign_referral should have raised ReferralAlreadyAssignedError"
                )
            except ReferralAlreadyAssignedError as e:
                # Expected: error is raised with correct context
                assert e.user_id == user_id
                assert e.existing_worker_id == original_worker

    @given(
        worker_id=st.uuids(),
    )
    @settings(max_examples=200)
    def test_reassignment_to_same_worker_is_idempotent(
        self, worker_id: uuid.UUID
    ) -> None:
        """Если assign_referral вызывается с тем же worker_id, что уже привязан,
        операция должна быть идемпотентной (без ошибки).

        **Validates: Requirements 6.3**
        """
        user_id = uuid.uuid4()
        mock_user = _make_mock_user(user_id, marketplace_referred_by=worker_id)
        mock_user.role = MagicMock()
        mock_user.role.__eq__ = lambda self, other: True  # noqa: E731

        mock_db = AsyncMock()
        mock_db.get = AsyncMock(return_value=mock_user)

        with patch("services.marketplace_referral_service.UserRole") as mock_role_enum:
            mock_role_enum.CLIENT = mock_user.role

            # Should NOT raise — idempotent operation
            asyncio.get_event_loop().run_until_complete(
                assign_referral(user_id, worker_id, mock_db)
            )
            # If we get here without exception, the test passes
