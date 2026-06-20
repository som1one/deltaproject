"""Unit-тесты: полный жизненный цикл заказа через state machine.

Проверяют три основных пути:
1. Happy path: PENDING_PAYMENT → ESCROW_HELD → BLOGGER_CONFIRMED → COMPLETED
2. Cancel path: PENDING_PAYMENT → CANCELLED
3. Refund path: PENDING_PAYMENT → ESCROW_HELD → REFUNDED

Используют validate_transition из services.order_state_machine для проверки
допустимости цепочек переходов (чистая логика, без async/DB).

Validates: Requirements 3.1, 4.2, 4.5, 10.2, 10.3, 10.4, 10.5, 10.6, 11.1
"""

import pytest

from enums.marketplace import MarketplaceOrderStatus
from services.order_state_machine import ALLOWED_TRANSITIONS, validate_transition


class TestHappyPathLifecycle:
    """Happy path: create → confirm_payment → complete → confirm → distribute.

    Validates: Requirements 3.1, 4.2, 4.5, 10.2, 10.3, 10.4
    """

    def test_pending_to_escrow_held(self) -> None:
        """Req 3.1, 10.2: Admin confirms payment → PENDING_PAYMENT → ESCROW_HELD."""
        assert validate_transition(
            MarketplaceOrderStatus.PENDING_PAYMENT.value,
            MarketplaceOrderStatus.ESCROW_HELD.value,
        ) is True

    def test_escrow_held_to_blogger_confirmed(self) -> None:
        """Req 4.2, 10.3: Blogger confirms completion → ESCROW_HELD → BLOGGER_CONFIRMED."""
        assert validate_transition(
            MarketplaceOrderStatus.ESCROW_HELD.value,
            MarketplaceOrderStatus.BLOGGER_CONFIRMED.value,
        ) is True

    def test_blogger_confirmed_to_completed(self) -> None:
        """Req 4.5, 10.4: Client confirms receipt → BLOGGER_CONFIRMED → COMPLETED."""
        assert validate_transition(
            MarketplaceOrderStatus.BLOGGER_CONFIRMED.value,
            MarketplaceOrderStatus.COMPLETED.value,
        ) is True

    def test_full_happy_path_chain(self) -> None:
        """Full chain: PENDING_PAYMENT → ESCROW_HELD → BLOGGER_CONFIRMED → COMPLETED."""
        statuses = [
            MarketplaceOrderStatus.PENDING_PAYMENT.value,
            MarketplaceOrderStatus.ESCROW_HELD.value,
            MarketplaceOrderStatus.BLOGGER_CONFIRMED.value,
            MarketplaceOrderStatus.COMPLETED.value,
        ]
        for i in range(len(statuses) - 1):
            current = statuses[i]
            target = statuses[i + 1]
            assert validate_transition(current, target) is True, (
                f"Transition {current} → {target} should be allowed"
            )

    def test_completed_is_terminal(self) -> None:
        """COMPLETED is a terminal state — no further transitions allowed."""
        for status in MarketplaceOrderStatus:
            assert validate_transition(
                MarketplaceOrderStatus.COMPLETED.value, status.value
            ) is False, f"COMPLETED → {status.value} should not be allowed"


class TestCancelPathLifecycle:
    """Cancel path: create → cancel.

    Validates: Requirements 10.5
    """

    def test_pending_to_cancelled(self) -> None:
        """Req 10.5: PENDING_PAYMENT → CANCELLED is allowed (cancel before payment)."""
        assert validate_transition(
            MarketplaceOrderStatus.PENDING_PAYMENT.value,
            MarketplaceOrderStatus.CANCELLED.value,
        ) is True

    def test_cancelled_is_terminal(self) -> None:
        """CANCELLED is a terminal state — no further transitions allowed."""
        for status in MarketplaceOrderStatus:
            assert validate_transition(
                MarketplaceOrderStatus.CANCELLED.value, status.value
            ) is False, f"CANCELLED → {status.value} should not be allowed"

    def test_cancel_not_allowed_from_escrow_held(self) -> None:
        """Cancel is NOT allowed once payment is confirmed (ESCROW_HELD)."""
        assert validate_transition(
            MarketplaceOrderStatus.ESCROW_HELD.value,
            MarketplaceOrderStatus.CANCELLED.value,
        ) is False

    def test_cancel_not_allowed_from_blogger_confirmed(self) -> None:
        """Cancel is NOT allowed from BLOGGER_CONFIRMED."""
        assert validate_transition(
            MarketplaceOrderStatus.BLOGGER_CONFIRMED.value,
            MarketplaceOrderStatus.CANCELLED.value,
        ) is False

    def test_cancel_not_allowed_from_completed(self) -> None:
        """Cancel is NOT allowed from COMPLETED."""
        assert validate_transition(
            MarketplaceOrderStatus.COMPLETED.value,
            MarketplaceOrderStatus.CANCELLED.value,
        ) is False


class TestRefundPathLifecycle:
    """Refund path: create → confirm_payment → refund.

    Validates: Requirements 10.6, 11.1
    """

    def test_pending_to_escrow_to_refund(self) -> None:
        """Req 11.1: Full refund path — PENDING_PAYMENT → ESCROW_HELD → REFUNDED."""
        assert validate_transition(
            MarketplaceOrderStatus.PENDING_PAYMENT.value,
            MarketplaceOrderStatus.ESCROW_HELD.value,
        ) is True
        assert validate_transition(
            MarketplaceOrderStatus.ESCROW_HELD.value,
            MarketplaceOrderStatus.REFUNDED.value,
        ) is True

    def test_refund_from_escrow_held(self) -> None:
        """Req 10.6: ESCROW_HELD → REFUNDED is allowed."""
        assert validate_transition(
            MarketplaceOrderStatus.ESCROW_HELD.value,
            MarketplaceOrderStatus.REFUNDED.value,
        ) is True

    def test_refund_from_blogger_confirmed(self) -> None:
        """Req 10.6: BLOGGER_CONFIRMED → REFUNDED is also allowed."""
        assert validate_transition(
            MarketplaceOrderStatus.BLOGGER_CONFIRMED.value,
            MarketplaceOrderStatus.REFUNDED.value,
        ) is True

    def test_refund_not_allowed_from_pending_payment(self) -> None:
        """Refund is NOT allowed directly from PENDING_PAYMENT (must confirm first)."""
        assert validate_transition(
            MarketplaceOrderStatus.PENDING_PAYMENT.value,
            MarketplaceOrderStatus.REFUNDED.value,
        ) is False

    def test_refunded_is_terminal(self) -> None:
        """REFUNDED is a terminal state — no further transitions allowed."""
        for status in MarketplaceOrderStatus:
            assert validate_transition(
                MarketplaceOrderStatus.REFUNDED.value, status.value
            ) is False, f"REFUNDED → {status.value} should not be allowed"

    def test_refund_not_allowed_from_completed(self) -> None:
        """Refund is NOT allowed from COMPLETED (funds already distributed)."""
        assert validate_transition(
            MarketplaceOrderStatus.COMPLETED.value,
            MarketplaceOrderStatus.REFUNDED.value,
        ) is False


class TestInvalidTransitions:
    """Verify that invalid transitions are properly rejected.

    Validates: Requirements 10.2, 10.3, 10.4, 10.5, 10.6
    """

    def test_skip_escrow_to_blogger_confirmed(self) -> None:
        """Cannot skip ESCROW_HELD: PENDING_PAYMENT → BLOGGER_CONFIRMED not allowed."""
        assert validate_transition(
            MarketplaceOrderStatus.PENDING_PAYMENT.value,
            MarketplaceOrderStatus.BLOGGER_CONFIRMED.value,
        ) is False

    def test_skip_to_completed_from_escrow(self) -> None:
        """Cannot skip BLOGGER_CONFIRMED: ESCROW_HELD → COMPLETED not allowed."""
        assert validate_transition(
            MarketplaceOrderStatus.ESCROW_HELD.value,
            MarketplaceOrderStatus.COMPLETED.value,
        ) is False

    def test_skip_to_completed_from_pending(self) -> None:
        """Cannot skip directly: PENDING_PAYMENT → COMPLETED not allowed."""
        assert validate_transition(
            MarketplaceOrderStatus.PENDING_PAYMENT.value,
            MarketplaceOrderStatus.COMPLETED.value,
        ) is False

    def test_backward_transition_not_allowed(self) -> None:
        """Backward transitions are never allowed."""
        # ESCROW_HELD → PENDING_PAYMENT
        assert validate_transition(
            MarketplaceOrderStatus.ESCROW_HELD.value,
            MarketplaceOrderStatus.PENDING_PAYMENT.value,
        ) is False
        # BLOGGER_CONFIRMED → ESCROW_HELD
        assert validate_transition(
            MarketplaceOrderStatus.BLOGGER_CONFIRMED.value,
            MarketplaceOrderStatus.ESCROW_HELD.value,
        ) is False
        # COMPLETED → BLOGGER_CONFIRMED
        assert validate_transition(
            MarketplaceOrderStatus.COMPLETED.value,
            MarketplaceOrderStatus.BLOGGER_CONFIRMED.value,
        ) is False

    def test_self_transition_not_allowed(self) -> None:
        """Self-transitions (same status) are never allowed."""
        for status in MarketplaceOrderStatus:
            assert validate_transition(status.value, status.value) is False, (
                f"Self-transition {status.value} → {status.value} should not be allowed"
            )
