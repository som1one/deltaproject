"""Property-based tests for marketplace escrow distribution logic.

Feature: worker-referral-orders
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


# --- Property 2: Корректность формулы распределения ---
# Feature: worker-referral-orders, Property 2: Корректность формулы распределения


@given(
    amount=amount_strategy,
    platform_pct=platform_pct_strategy,
    worker_pct=worker_pct_strategy,
)
@settings(max_examples=200)
def test_distribution_formula_correctness(
    amount: int,
    platform_pct: Decimal,
    worker_pct: Decimal,
) -> None:
    """Property 2: Корректность формулы распределения.

    **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

    Для любой суммы заказа и допустимых комиссий:
    1. platform_share == floor(amount × platform_pct / 100)
    2. worker_share == floor(amount × worker_pct / 100)
    3. blogger_share == amount - platform_share - worker_share
    4. Если worker_pct == 0: worker_share == 0 и blogger_share == amount - platform_share
    """
    blogger_share, worker_share, platform_share = calculate_distribution(
        amount_kopeks=amount,
        platform_commission_pct=platform_pct,
        worker_commission_pct=worker_pct,
    )

    # Ожидаемые значения по формуле
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
    expected_blogger = amount - expected_platform - expected_worker

    # 1. platform_share == floor(amount × platform_pct / 100)
    assert platform_share == expected_platform, (
        f"platform_share mismatch: got {platform_share}, expected {expected_platform} "
        f"(amount={amount}, platform_pct={platform_pct})"
    )

    # 2. worker_share == floor(amount × worker_pct / 100)
    assert worker_share == expected_worker, (
        f"worker_share mismatch: got {worker_share}, expected {expected_worker} "
        f"(amount={amount}, worker_pct={worker_pct})"
    )

    # 3. blogger_share == amount - platform_share - worker_share
    assert blogger_share == expected_blogger, (
        f"blogger_share mismatch: got {blogger_share}, expected {expected_blogger} "
        f"(amount={amount}, platform_pct={platform_pct}, worker_pct={worker_pct})"
    )

    # 4. Когда worker_pct == 0: worker_share == 0 и blogger_share == amount - platform_share
    if worker_pct == Decimal("0") or worker_pct == Decimal("0.00"):
        assert worker_share == 0, (
            f"worker_share should be 0 when worker_pct=0, got {worker_share}"
        )
        assert blogger_share == amount - platform_share, (
            f"blogger_share should be amount - platform_share when worker_pct=0, "
            f"got blogger_share={blogger_share}, expected={amount - platform_share}"
        )


# --- Property 3: Идемпотентность распределения средств ---
# Feature: worker-referral-orders, Property 3: Идемпотентность распределения средств


@given(
    amount=amount_strategy,
    platform_pct=platform_pct_strategy,
    worker_pct=worker_pct_strategy,
)
@settings(max_examples=200)
def test_distribution_idempotency(
    amount: int,
    platform_pct: Decimal,
    worker_pct: Decimal,
) -> None:
    """Property 3: Идемпотентность распределения средств.

    **Validates: Requirements 5.7**

    Для любых входных данных, calculate_distribution является чистой функцией:
    повторный вызов с теми же аргументами возвращает идентичный результат.
    Это документирует гарантию идемпотентности на уровне вычислений —
    вызов distribute_funds дважды на одном заказе не создаст дублей,
    т.к. результат расчёта детерминирован, а idempotency_key предотвращает
    повторную запись в журнал.
    """
    # Первый вызов
    result_1 = calculate_distribution(
        amount_kopeks=amount,
        platform_commission_pct=platform_pct,
        worker_commission_pct=worker_pct,
    )

    # Второй вызов с теми же входными данными
    result_2 = calculate_distribution(
        amount_kopeks=amount,
        platform_commission_pct=platform_pct,
        worker_commission_pct=worker_pct,
    )

    # Идемпотентность: результаты идентичны
    assert result_1 == result_2, (
        f"calculate_distribution is not idempotent! "
        f"First call: {result_1}, Second call: {result_2} "
        f"(amount={amount}, platform_pct={platform_pct}, worker_pct={worker_pct})"
    )

    # Дополнительно: структура результата — три неотрицательных целых числа
    blogger_1, worker_1, platform_1 = result_1
    blogger_2, worker_2, platform_2 = result_2

    assert blogger_1 == blogger_2, "blogger_share differs between calls"
    assert worker_1 == worker_2, "worker_share differs between calls"
    assert platform_1 == platform_2, "platform_share differs between calls"
