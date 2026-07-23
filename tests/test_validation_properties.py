"""Property-based тесты для валидации создания заказа.

Feature: worker-referral-orders, Property 10: Валидация создания заказа
Validates: Requirements 9.3, 9.4
"""

import uuid

import pytest
from hypothesis import HealthCheck, assume, given, settings
from hypothesis import strategies as st
from pydantic import ValidationError

from schemas.marketplace_orders import OrderCreateRequest

# Фиксированный UUID для blogger_id (требуется схемой, но не тестируется)
FIXED_BLOGGER_ID = uuid.uuid4()


class TestOrderCreateValidationProperty:
    """**Validates: Requirements 9.3, 9.4**

    Property 10: Для любого запроса на создание заказа,
    если message пуст или длиннее 1000 символов, или amount_kopeks < 100
    или amount_kopeks > 1_000_000_000, то создание должно быть отклонено.
    Валидные комбинации (message 1-1000 символов, amount 100-1B) принимаются.
    """

    @given(
        message=st.one_of(
            st.just(""),  # пустое сообщение
            st.text(min_size=1001, max_size=1500),  # слишком длинное сообщение
        ),
        amount=st.integers(min_value=100, max_value=1_000_000_000),
    )
    @settings(max_examples=200)
    def test_invalid_message_rejected(self, message: str, amount: int) -> None:
        """Сообщение пустое или длиннее 1000 символов отклоняется."""
        with pytest.raises(ValidationError):
            OrderCreateRequest(
                blogger_id=FIXED_BLOGGER_ID,
                message=message,
                amount_kopeks=amount,
            )

    @given(
        message=st.text(min_size=1, max_size=1000),
        amount=st.one_of(
            st.integers(max_value=99),  # слишком маленькая сумма
            st.integers(min_value=1_000_000_001),  # слишком большая сумма
        ),
    )
    @settings(max_examples=200)
    def test_invalid_amount_rejected(self, message: str, amount: int) -> None:
        """amount_kopeks < 100 или > 1_000_000_000 отклоняется."""
        with pytest.raises(ValidationError):
            OrderCreateRequest(
                blogger_id=FIXED_BLOGGER_ID,
                message=message,
                amount_kopeks=amount,
            )

    @given(
        message=st.text(min_size=1, max_size=1000),
        amount=st.integers(min_value=100, max_value=1_000_000_000),
    )
    @settings(max_examples=200)
    def test_valid_combinations_accepted(self, message: str, amount: int) -> None:
        """Валидные комбинации (message 1-1000 символов, amount 100-1B) принимаются."""
        order = OrderCreateRequest(
            blogger_id=FIXED_BLOGGER_ID,
            message=message,
            amount_kopeks=amount,
        )
        assert order.message == message
        assert order.amount_kopeks == amount
        assert order.blogger_id == FIXED_BLOGGER_ID


# --- Additional imports for Property 5 ---
import re

from schemas.settlement_account import SettlementAccountUpsert

# Valid patterns for reference
VALID_ACCOUNT_NUMBER_RE = re.compile(r"^\d{20}$")
VALID_BIC_RE = re.compile(r"^\d{9}$")


# --- Strategies ---

def invalid_account_number_strategy() -> st.SearchStrategy[str]:
    """Generate strings that do NOT match exactly 20 digits."""
    return st.text().filter(lambda s: not VALID_ACCOUNT_NUMBER_RE.match(s))


def invalid_bic_strategy() -> st.SearchStrategy[str]:
    """Generate strings that do NOT match exactly 9 digits."""
    return st.text().filter(lambda s: not VALID_BIC_RE.match(s))


# --- Property 5: Валидация полей расчётного счёта ---
# Feature: worker-referral-orders, Property 5: Валидация полей расчётного счёта


class TestSettlementAccountNumberValidation:
    """Any string NOT matching exactly 20 digits must be rejected for account_number.

    **Validates: Requirements 1.3**
    """

    @given(account_number=invalid_account_number_strategy())
    @settings(max_examples=200)
    def test_invalid_account_number_rejected(self, account_number: str) -> None:
        """Property: any non-20-digit string is rejected for account_number.

        **Validates: Requirements 1.3**
        """
        with pytest.raises(ValidationError) as exc_info:
            SettlementAccountUpsert(
                account_number=account_number,
                bic="123456789",  # valid BIC
                bank_name="Тестовый банк",
                recipient_name="ООО Тест",
            )
        # Ensure the error is about account_number
        errors = exc_info.value.errors()
        account_errors = [e for e in errors if "account_number" in e.get("loc", ())]
        assert len(account_errors) > 0, (
            f"Expected validation error for account_number with value: {account_number!r}"
        )

    @given(account_number=st.from_regex(r"\d{20}", fullmatch=True))
    @settings(max_examples=200)
    def test_valid_account_number_accepted(self, account_number: str) -> None:
        """Sanity check: valid 20-digit strings are accepted."""
        result = SettlementAccountUpsert(
            account_number=account_number,
            bic="123456789",
            bank_name="Тестовый банк",
            recipient_name="ООО Тест",
        )
        assert result.account_number == account_number


class TestSettlementAccountBicValidation:
    """Any string NOT matching exactly 9 digits must be rejected for bic.

    **Validates: Requirements 1.4**
    """

    @given(bic=invalid_bic_strategy())
    @settings(max_examples=200)
    def test_invalid_bic_rejected(self, bic: str) -> None:
        """Property: any non-9-digit string is rejected for bic.

        **Validates: Requirements 1.4**
        """
        with pytest.raises(ValidationError) as exc_info:
            SettlementAccountUpsert(
                account_number="12345678901234567890",  # valid account number
                bic=bic,
                bank_name="Тестовый банк",
                recipient_name="ООО Тест",
            )
        errors = exc_info.value.errors()
        bic_errors = [e for e in errors if "bic" in e.get("loc", ())]
        assert len(bic_errors) > 0, (
            f"Expected validation error for bic with value: {bic!r}"
        )

    @given(bic=st.from_regex(r"\d{9}", fullmatch=True))
    @settings(max_examples=200)
    def test_valid_bic_accepted(self, bic: str) -> None:
        """Sanity check: valid 9-digit strings are accepted."""
        result = SettlementAccountUpsert(
            account_number="12345678901234567890",
            bic=bic,
            bank_name="Тестовый банк",
            recipient_name="ООО Тест",
        )
        assert result.bic == bic


class TestSettlementAccountEdgeCases:
    """Edge cases for account_number and bic validation.

    **Validates: Requirements 1.3, 1.4**
    """

    @pytest.mark.parametrize("account_number", [
        "",                        # empty
        "1234567890",              # too short (10 digits)
        "123456789012345678901",   # too long (21 digits)
        "1234567890123456789a",    # 19 digits + letter
        "abcdefghijklmnopqrst",   # 20 letters
        " 12345678901234567890",   # leading space
        "12345678901234567890 ",   # trailing space
        "1234 5678 9012 3456 7890",  # spaces between digits
    ])
    def test_account_number_edge_cases_rejected(self, account_number: str) -> None:
        """Edge cases: various invalid account_number formats are rejected."""
        with pytest.raises(ValidationError):
            SettlementAccountUpsert(
                account_number=account_number,
                bic="123456789",
                bank_name="Тестовый банк",
                recipient_name="ООО Тест",
            )

    @pytest.mark.parametrize("bic", [
        "",                # empty
        "12345",           # too short (5 digits)
        "1234567890",      # too long (10 digits)
        "12345678a",       # 8 digits + letter
        "abcdefghi",       # 9 letters
        " 123456789",      # leading space
        "123456789 ",      # trailing space
        "123 456 789",     # spaces between digits
    ])
    def test_bic_edge_cases_rejected(self, bic: str) -> None:
        """Edge cases: various invalid bic formats are rejected."""
        with pytest.raises(ValidationError):
            SettlementAccountUpsert(
                account_number="12345678901234567890",
                bic=bic,
                bank_name="Тестовый банк",
                recipient_name="ООО Тест",
            )


# ---------------------------------------------------------------------------
# Property 6: Валидация комиссий
# Feature: worker-referral-orders
# Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6
# ---------------------------------------------------------------------------

from decimal import Decimal as _Decimal

from schemas.marketplace_admin import CommissionSettingsRequest


class TestCommissionValidationProperty:
    """**Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6**

    Property 6: Для любой пары значений (platform_pct, worker_pct),
    если platform_pct не в диапазоне [1, 50], или worker_pct не в диапазоне [1, 30],
    или количество знаков после запятой > 2, или platform_pct + worker_pct > 80,
    то сохранение комиссий должно быть отклонено.
    """

    # --- Стратегии ---
    # Decimal-значения с точностью до 2 знаков в допустимых диапазонах
    _valid_platform_pct = st.decimals(
        min_value=_Decimal("1"),
        max_value=_Decimal("50"),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    )
    _valid_worker_pct = st.decimals(
        min_value=_Decimal("1"),
        max_value=_Decimal("30"),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    )

    @given(
        platform_pct=st.decimals(
            min_value=_Decimal("-100"),
            max_value=_Decimal("200"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
        worker_pct=st.decimals(
            min_value=_Decimal("1"),
            max_value=_Decimal("30"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
    )
    @settings(max_examples=200)
    def test_platform_commission_out_of_range_rejected(
        self, platform_pct: _Decimal, worker_pct: _Decimal
    ) -> None:
        """platform_commission_pct вне [1, 50] отклоняется."""
        assume(platform_pct < _Decimal("1") or platform_pct > _Decimal("50"))
        with pytest.raises(ValidationError):
            CommissionSettingsRequest(
                platform_commission_pct=platform_pct,
                worker_referral_commission_pct=worker_pct,
                blogger_referral_commission_pct=_Decimal("0.00"),
            )

    @given(
        platform_pct=st.decimals(
            min_value=_Decimal("1"),
            max_value=_Decimal("50"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
        worker_pct=st.decimals(
            min_value=_Decimal("-100"),
            max_value=_Decimal("200"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
    )
    @settings(max_examples=200)
    def test_worker_commission_out_of_range_rejected(
        self, platform_pct: _Decimal, worker_pct: _Decimal
    ) -> None:
        """worker_referral_commission_pct вне [1, 30] отклоняется."""
        assume(worker_pct < _Decimal("1") or worker_pct > _Decimal("30"))
        with pytest.raises(ValidationError):
            CommissionSettingsRequest(
                platform_commission_pct=platform_pct,
                worker_referral_commission_pct=worker_pct,
                blogger_referral_commission_pct=_Decimal("0.00"),
            )

    @given(
        platform_pct=st.decimals(
            min_value=_Decimal("1"),
            max_value=_Decimal("50"),
            places=3,
            allow_nan=False,
            allow_infinity=False,
        ),
        worker_pct=st.decimals(
            min_value=_Decimal("1"),
            max_value=_Decimal("30"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
    )
    @settings(max_examples=200)
    def test_platform_commission_too_many_decimals_rejected(
        self, platform_pct: _Decimal, worker_pct: _Decimal
    ) -> None:
        """platform_commission_pct с более чем 2 знаками после запятой отклоняется."""
        # Убедимся, что значение действительно имеет >2 знаков
        assume(platform_pct != platform_pct.quantize(_Decimal("0.01")))
        with pytest.raises(ValidationError):
            CommissionSettingsRequest(
                platform_commission_pct=platform_pct,
                worker_referral_commission_pct=worker_pct,
                blogger_referral_commission_pct=_Decimal("0.00"),
            )

    @given(
        platform_pct=st.decimals(
            min_value=_Decimal("1"),
            max_value=_Decimal("50"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
        worker_pct=st.decimals(
            min_value=_Decimal("1"),
            max_value=_Decimal("30"),
            places=3,
            allow_nan=False,
            allow_infinity=False,
        ),
    )
    @settings(max_examples=200)
    def test_worker_commission_too_many_decimals_rejected(
        self, platform_pct: _Decimal, worker_pct: _Decimal
    ) -> None:
        """worker_referral_commission_pct с более чем 2 знаками после запятой отклоняется."""
        assume(worker_pct != worker_pct.quantize(_Decimal("0.01")))
        with pytest.raises(ValidationError):
            CommissionSettingsRequest(
                platform_commission_pct=platform_pct,
                worker_referral_commission_pct=worker_pct,
                blogger_referral_commission_pct=_Decimal("0.00"),
            )

    @given(
        platform_pct=st.decimals(
            min_value=_Decimal("1"),
            max_value=_Decimal("50"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
        worker_pct=st.decimals(
            min_value=_Decimal("1"),
            max_value=_Decimal("30"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
    )
    @settings(max_examples=200)
    def test_sum_not_exceeding_80_with_valid_ranges(
        self, platform_pct: _Decimal, worker_pct: _Decimal
    ) -> None:
        """С валидными диапазонами [1,50] + [1,30] сумма никогда не превышает 80 — всё принимается."""
        # This verifies the invariant: any valid individual values satisfy sum <= 80
        assert platform_pct + worker_pct <= _Decimal("80")
        result = CommissionSettingsRequest(
            platform_commission_pct=platform_pct,
            worker_referral_commission_pct=worker_pct,
            blogger_referral_commission_pct=_Decimal("0.00"),
        )
        assert result.platform_commission_pct == platform_pct
        assert result.worker_referral_commission_pct == worker_pct

    @given(
        platform_pct=st.decimals(
            min_value=_Decimal("1"),
            max_value=_Decimal("100"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
        worker_pct=st.decimals(
            min_value=_Decimal("1"),
            max_value=_Decimal("100"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
    )
    @settings(
        max_examples=200,
        suppress_health_check=[HealthCheck.filter_too_much],
    )
    def test_sum_exceeding_80_rejected(
        self, platform_pct: _Decimal, worker_pct: _Decimal
    ) -> None:
        """Любая пара с суммой > 80% отклоняется (через ограничение диапазонов или model_validator)."""
        assume(platform_pct + worker_pct > _Decimal("80"))
        with pytest.raises(ValidationError):
            CommissionSettingsRequest(
                platform_commission_pct=platform_pct,
                worker_referral_commission_pct=worker_pct,
                blogger_referral_commission_pct=_Decimal("0.00"),
            )

    @given(
        platform_pct=st.decimals(
            min_value=_Decimal("1"),
            max_value=_Decimal("50"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
        worker_pct=st.decimals(
            min_value=_Decimal("1"),
            max_value=_Decimal("30"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
    )
    @settings(max_examples=200)
    def test_valid_commissions_accepted(
        self, platform_pct: _Decimal, worker_pct: _Decimal
    ) -> None:
        """Валидные комбинации в допустимых диапазонах с суммой ≤ 80 принимаются."""
        assume(platform_pct + worker_pct <= _Decimal("80"))
        result = CommissionSettingsRequest(
            platform_commission_pct=platform_pct,
            worker_referral_commission_pct=worker_pct,
            blogger_referral_commission_pct=_Decimal("0.00"),
        )
        assert result.platform_commission_pct == platform_pct
        assert result.worker_referral_commission_pct == worker_pct

    @given(
        blogger_pct=st.decimals(
            min_value=_Decimal("-100"),
            max_value=_Decimal("200"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
    )
    @settings(max_examples=200)
    def test_blogger_commission_out_of_range_rejected(
        self, blogger_pct: _Decimal
    ) -> None:
        """blogger_referral_commission_pct вне [0, 30] отклоняется."""
        assume(blogger_pct < _Decimal("0") or blogger_pct > _Decimal("30"))
        with pytest.raises(ValidationError):
            CommissionSettingsRequest(
                platform_commission_pct=_Decimal("25.00"),
                worker_referral_commission_pct=_Decimal("5.00"),
                blogger_referral_commission_pct=blogger_pct,
            )

    @given(
        platform_pct=st.decimals(
            min_value=_Decimal("40"),
            max_value=_Decimal("50"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
        worker_pct=st.decimals(
            min_value=_Decimal("20"),
            max_value=_Decimal("30"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
        blogger_pct=st.decimals(
            min_value=_Decimal("20"),
            max_value=_Decimal("30"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
    )
    @settings(
        max_examples=200,
        suppress_health_check=[HealthCheck.filter_too_much],
    )
    def test_three_way_sum_exceeding_80_rejected(
        self, platform_pct: _Decimal, worker_pct: _Decimal, blogger_pct: _Decimal
    ) -> None:
        """Сумма platform + worker + blogger > 80% отклоняется, даже при валидных полях."""
        assume(platform_pct + worker_pct + blogger_pct > _Decimal("80"))
        with pytest.raises(ValidationError):
            CommissionSettingsRequest(
                platform_commission_pct=platform_pct,
                worker_referral_commission_pct=worker_pct,
                blogger_referral_commission_pct=blogger_pct,
            )


# ---------------------------------------------------------------------------
# Property 13: Валидация причины возврата
# Feature: worker-referral-orders
# Validates: Requirements 11.4
# ---------------------------------------------------------------------------

from schemas.marketplace_orders import RefundRequest


class TestRefundReasonValidationProperty:
    """**Validates: Requirements 11.4**

    Property 13: Для любой строки-причины возврата, которая пуста, состоит только
    из пробелов или превышает 1000 символов, операция возврата должна быть отклонена.
    Валидные строки (1–1000 символов, не только пробелы) принимаются.
    """

    @given(reason=st.just(""))
    @settings(max_examples=200)
    def test_empty_reason_rejected(self, reason: str) -> None:
        """Пустая строка отклоняется.

        **Validates: Requirements 11.4**
        """
        with pytest.raises(ValidationError):
            RefundRequest(reason=reason)

    @given(reason=st.from_regex(r"^\s+$", fullmatch=True))
    @settings(max_examples=200)
    def test_whitespace_only_reason_rejected(self, reason: str) -> None:
        """Строка, состоящая только из пробельных символов, отклоняется.

        **Validates: Requirements 11.4**
        """
        with pytest.raises(ValidationError):
            RefundRequest(reason=reason)

    @given(reason=st.text(min_size=1001, max_size=2000))
    @settings(max_examples=200)
    def test_too_long_reason_rejected(self, reason: str) -> None:
        """Строка длиннее 1000 символов отклоняется.

        **Validates: Requirements 11.4**
        """
        with pytest.raises(ValidationError):
            RefundRequest(reason=reason)

    @given(reason=st.text(min_size=1, max_size=1000).filter(lambda s: s.strip()))
    @settings(max_examples=200)
    def test_valid_reason_accepted(self, reason: str) -> None:
        """Валидные строки (1–1000 символов, не только пробелы) принимаются.

        **Validates: Requirements 11.4**
        """
        result = RefundRequest(reason=reason)
        assert result.reason == reason
