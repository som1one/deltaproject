"""Property-based тесты для state machine переходов статусов заказа.

Feature: worker-referral-orders, Property 4: Допустимость переходов статусов (State Machine)
Validates: Requirements 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 11.5, 11.7, 3.3
"""

from hypothesis import given, settings
from hypothesis import strategies as st

from enums.marketplace import MarketplaceOrderStatus
from services.order_state_machine import ALLOWED_TRANSITIONS, validate_transition

# Все значения статусов
statuses = [s.value for s in MarketplaceOrderStatus]

# Терминальные статусы — из них нет допустимых переходов
TERMINAL_STATUSES = {"COMPLETED", "REFUNDED", "CANCELLED", "PAYMENT_FAILED"}


class TestStateMachineProperty:
    """**Validates: Requirements 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 11.5, 11.7, 3.3**"""

    @given(
        current=st.sampled_from(statuses),
        target=st.sampled_from(statuses),
    )
    @settings(max_examples=200)
    def test_disallowed_transitions_rejected(self, current: str, target: str) -> None:
        """Для любой пары (current, target) НЕ входящей в ALLOWED_TRANSITIONS,
        validate_transition возвращает False."""
        allowed_targets = ALLOWED_TRANSITIONS.get(current, set())
        if target not in allowed_targets:
            assert validate_transition(current, target) is False

    @given(
        current=st.sampled_from(statuses),
        target=st.sampled_from(statuses),
    )
    @settings(max_examples=200)
    def test_allowed_transitions_accepted(self, current: str, target: str) -> None:
        """Для любой пары (current, target) ВХОДЯЩЕЙ в ALLOWED_TRANSITIONS,
        validate_transition возвращает True."""
        allowed_targets = ALLOWED_TRANSITIONS.get(current, set())
        if target in allowed_targets:
            assert validate_transition(current, target) is True

    @given(
        current=st.sampled_from(list(TERMINAL_STATUSES)),
        target=st.sampled_from(statuses),
    )
    @settings(max_examples=200)
    def test_terminal_states_no_outgoing_transitions(self, current: str, target: str) -> None:
        """Терминальные статусы (COMPLETED, REFUNDED, CANCELLED, PAYMENT_FAILED)
        никогда не допускают переходов ни в какой другой статус."""
        assert validate_transition(current, target) is False
