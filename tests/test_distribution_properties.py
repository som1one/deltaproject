"""Property-based tests for marketplace escrow distribution logic.

Feature: worker-referral-orders (+ blogger referral 2nd level)
Uses Hypothesis for property-based testing of the distribution formula.
"""

from decimal import Decimal

from hypothesis import given, settings
from hypothesis import strategies as st

from services.marketplace_escrow_service import calculate_distribution


# --- Strategies ---
# amount_kopeks: от 100 копеек (мин. заказ) до 1_000_000_000 (макс.)
amount_strategy = st.integers(min_value=100, max_value=1_000_000_000)

# platform_commission_pct: от 1.00 до 50.00 с точностью до 2 знаков
platform_pct_strategy = st.decimals(
    min_value=Decimal("1.00"),
    max_value=Decimal("50.00"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

# worker_commission_pct: от 0.00 до 30.00 (0 — нет воркера)
worker_pct_strategy = st.decimals(
    min_value=Decimal("0.00"),
    max_value=Decimal("30.00"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

# blogger_referrer_commission_pct: от 0.00 до 30.00 (0 — нет блогера-реферера)
blogger_pct_strategy = st.decimals(
    min_value=Decimal("0.00"),
    max_value=Decimal("30.00"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)


# --- Property 2: Корректность формулы распределения ---
# Feature: worker-referral-orders, Property 2: Корректность формулы распределения


@given(
    amount=amount_strategy,
    platform_pct=platform_pct_strategy,
    worker_pct=worker_pct_strategy,
    blogger_pct=blogger_pct_strategy,
)
@settings(max_examples=200)
def test_distribution_formula_correctness(
    amount: int,
    platform_pct: Decimal,
    worker_pct: Decimal,
    blogger_pct: Decimal,
) -> None:
    """Property 2: Корректность формулы распределения (4-сторонний сплит).

    Для любой суммы заказа и допустимых комиссий:
    1. platform_share == floor(amount × platform_pct / 100)
    2. worker_share == floor(amount × worker_pct / 100)
    3. blogger_referral_share == floor(amount × blogger_pct / 100)
    4. blogger_share == amount - platform - worker - blogger_referral (остаток автору)
    5. Инвариант сохранения: сумма всех долей == amount
    """
    blogger_share, worker_share, blogger_referral_share, platform_share = (
        calculate_distribution(
            amount_kopeks=amount,
            platform_commission_pct=platform_pct,
            worker_commission_pct=worker_pct,
            blogger_referrer_commission_pct=blogger_pct,
        )
    )

    expected_platform = int(
        (Decimal(amount) * platform_pct / Decimal(100)).to_integral_value(
            rounding="ROUND_FLOOR"
        )
    )
    expected_worker = int(
        (Decimal(amount) * worker_pct / Decimal(100)).to_integral_value(
            rounding="ROUND_FLOOR"
        )
    )
    expected_blogger_referral = int(
        (Decimal(amount) * blogger_pct / Decimal(100)).to_integral_value(
            rounding="ROUND_FLOOR"
        )
    )
    expected_blogger = (
        amount - expected_platform - expected_worker - expected_blogger_referral
    )

    assert platform_share == expected_platform
    assert worker_share == expected_worker
    assert blogger_referral_share == expected_blogger_referral
    assert blogger_share == expected_blogger

    # Инвариант сохранения суммы
    assert (
        blogger_share + worker_share + blogger_referral_share + platform_share == amount
    )

    # Когда pct == 0 — соответствующая доля обнуляется
    if blogger_pct == Decimal("0") or blogger_pct == Decimal("0.00"):
        assert blogger_referral_share == 0
    if worker_pct == Decimal("0") or worker_pct == Decimal("0.00"):
        assert worker_share == 0


# --- Property 3: Идемпотентность распределения средств ---
# Feature: worker-referral-orders, Property 3: Идемпотентность распределения средств


@given(
    amount=amount_strategy,
    platform_pct=platform_pct_strategy,
    worker_pct=worker_pct_strategy,
    blogger_pct=blogger_pct_strategy,
)
@settings(max_examples=200)
def test_distribution_idempotency(
    amount: int,
    platform_pct: Decimal,
    worker_pct: Decimal,
    blogger_pct: Decimal,
) -> None:
    """Property 3: calculate_distribution — чистая детерминированная функция.

    Повторный вызов с теми же аргументами возвращает идентичный результат.
    """
    result_1 = calculate_distribution(
        amount_kopeks=amount,
        platform_commission_pct=platform_pct,
        worker_commission_pct=worker_pct,
        blogger_referrer_commission_pct=blogger_pct,
    )
    result_2 = calculate_distribution(
        amount_kopeks=amount,
        platform_commission_pct=platform_pct,
        worker_commission_pct=worker_pct,
        blogger_referrer_commission_pct=blogger_pct,
    )

    assert result_1 == result_2

    blogger_1, worker_1, blogger_ref_1, platform_1 = result_1
    blogger_2, worker_2, blogger_ref_2, platform_2 = result_2

    assert blogger_1 == blogger_2
    assert worker_1 == worker_2
    assert blogger_ref_1 == blogger_ref_2
    assert platform_1 == platform_2
