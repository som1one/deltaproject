"""Unit tests for marketplace escrow service distribution logic."""

from decimal import Decimal

from services.marketplace_escrow_service import DistributionResult, calculate_distribution


def test_distribution_conservation_basic() -> None:
    """Сумма долей всегда равна исходной сумме."""
    amount = 10_000
    blogger, worker, blogger_ref, platform = calculate_distribution(
        amount, Decimal("25.00"), Decimal("5.00")
    )
    assert blogger + worker + blogger_ref + platform == amount


def test_distribution_values_correct() -> None:
    """Проверка конкретных значений: 25% платформа, 5% воркер, без блогера-реферера."""
    amount = 10_000
    blogger, worker, blogger_ref, platform = calculate_distribution(
        amount, Decimal("25.00"), Decimal("5.00")
    )
    assert platform == 2500  # floor(10000 * 25 / 100) = 2500
    assert worker == 500  # floor(10000 * 5 / 100) = 500
    assert blogger_ref == 0  # по умолчанию blogger_ref_pct = 0
    assert blogger == 7000  # 10000 - 2500 - 500 = 7000


def test_distribution_no_worker() -> None:
    """Без воркера вся сумма минус платформа идёт блогеру."""
    amount = 10_000
    blogger, worker, blogger_ref, platform = calculate_distribution(
        amount, Decimal("25.00"), Decimal("0")
    )
    assert worker == 0
    assert blogger_ref == 0
    assert platform == 2500
    assert blogger == 7500
    assert blogger + worker + blogger_ref + platform == amount


def test_distribution_with_blogger_referral() -> None:
    """2-й уровень: платформа 25%, воркер 5%, блогер-реферер 5% → автору остаток."""
    amount = 10_000
    blogger, worker, blogger_ref, platform = calculate_distribution(
        amount, Decimal("25.00"), Decimal("5.00"), Decimal("5.00")
    )
    assert platform == 2500
    assert worker == 500
    assert blogger_ref == 500  # floor(10000 * 5 / 100) = 500
    assert blogger == 6500  # 10000 - 2500 - 500 - 500
    assert blogger + worker + blogger_ref + platform == amount


def test_distribution_blogger_referral_remainder_to_author() -> None:
    """Остаток от floor-деления по всем трём долям достаётся автору."""
    # 10003 * 25 / 100 = 2500.75 → 2500; * 5 → 500.15 → 500; * 5 → 500
    amount = 10_003
    blogger, worker, blogger_ref, platform = calculate_distribution(
        amount, Decimal("25.00"), Decimal("5.00"), Decimal("5.00")
    )
    assert platform == 2500
    assert worker == 500
    assert blogger_ref == 500
    assert blogger == 10_003 - 2500 - 500 - 500
    assert blogger + worker + blogger_ref + platform == amount


def test_distribution_remainder_to_blogger() -> None:
    """Остаток от floor-деления достаётся блогеру (без 2-го уровня)."""
    amount = 10_001
    blogger, worker, blogger_ref, platform = calculate_distribution(
        amount, Decimal("25.00"), Decimal("5.00")
    )
    assert platform == 2500
    assert worker == 500
    assert blogger_ref == 0
    assert blogger == 7001
    assert blogger + worker + blogger_ref + platform == amount


def test_distribution_fractional_commission() -> None:
    """Дробные проценты комиссии (например 25.50%)."""
    amount = 10_000
    blogger, worker, blogger_ref, platform = calculate_distribution(
        amount, Decimal("25.50"), Decimal("5.25"), Decimal("2.50")
    )
    # floor(10000 * 25.50 / 100) = 2550; * 5.25 = 525; * 2.50 = 250
    assert platform == 2550
    assert worker == 525
    assert blogger_ref == 250
    assert blogger == 10_000 - 2550 - 525 - 250
    assert blogger + worker + blogger_ref + platform == amount


def test_distribution_large_amount() -> None:
    """Большая сумма (100 000 000 копеек = 1 000 000 руб)."""
    amount = 100_000_000
    blogger, worker, blogger_ref, platform = calculate_distribution(
        amount, Decimal("25.00"), Decimal("5.00"), Decimal("5.00")
    )
    assert platform == 25_000_000
    assert worker == 5_000_000
    assert blogger_ref == 5_000_000
    assert blogger == 65_000_000
    assert blogger + worker + blogger_ref + platform == amount


def test_distribution_minimum_amount() -> None:
    """Минимальная сумма (100 копеек = 1 рубль)."""
    amount = 100
    blogger, worker, blogger_ref, platform = calculate_distribution(
        amount, Decimal("25.00"), Decimal("5.00"), Decimal("5.00")
    )
    assert platform == 25
    assert worker == 5
    assert blogger_ref == 5
    assert blogger == 65
    assert blogger + worker + blogger_ref + platform == amount


def test_distribution_all_shares_non_negative() -> None:
    """Все доли неотрицательны при максимальных комиссиях (сумма ≤ 80%)."""
    amount = 100
    blogger, worker, blogger_ref, platform = calculate_distribution(
        amount, Decimal("50.00"), Decimal("20.00"), Decimal("10.00")
    )
    assert blogger >= 0
    assert worker >= 0
    assert blogger_ref >= 0
    assert platform >= 0
    assert blogger + worker + blogger_ref + platform == amount


def test_distribution_result_has_blogger_referral_field() -> None:
    """DistributionResult содержит поле blogger_referral_share."""
    import uuid

    result = DistributionResult(
        blogger_share=7000,
        worker_share=500,
        blogger_referral_share=500,
        platform_share=2000,
        order_id=uuid.uuid4(),
    )
    assert result.blogger_referral_share == 500
