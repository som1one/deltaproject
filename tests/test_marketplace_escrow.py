"""Unit tests for marketplace escrow service distribution logic."""

from decimal import Decimal

from services.marketplace_escrow_service import DistributionResult, calculate_distribution


def test_distribution_conservation_basic() -> None:
    """Сумма долей всегда равна исходной сумме."""
    amount = 10_000
    blogger, worker, platform = calculate_distribution(
        amount, Decimal("25.00"), Decimal("5.00")
    )
    assert blogger + worker + platform == amount


def test_distribution_values_correct() -> None:
    """Проверка конкретных значений: 25% платформа, 5% воркер."""
    amount = 10_000
    blogger, worker, platform = calculate_distribution(
        amount, Decimal("25.00"), Decimal("5.00")
    )
    assert platform == 2500  # floor(10000 * 25 / 100) = 2500
    assert worker == 500  # floor(10000 * 5 / 100) = 500
    assert blogger == 7000  # 10000 - 2500 - 500 = 7000


def test_distribution_no_worker() -> None:
    """Без воркера вся сумма минус платформа идёт блогеру."""
    amount = 10_000
    blogger, worker, platform = calculate_distribution(
        amount, Decimal("25.00"), Decimal("0")
    )
    assert worker == 0
    assert platform == 2500
    assert blogger == 7500
    assert blogger + worker + platform == amount


def test_distribution_remainder_to_blogger() -> None:
    """Остаток от floor-деления достаётся блогеру."""
    # 10001 * 25 / 100 = 2500.25 → floor = 2500
    # 10001 * 5 / 100 = 500.05 → floor = 500
    # blogger = 10001 - 2500 - 500 = 7001
    amount = 10_001
    blogger, worker, platform = calculate_distribution(
        amount, Decimal("25.00"), Decimal("5.00")
    )
    assert platform == 2500
    assert worker == 500
    assert blogger == 7001
    assert blogger + worker + platform == amount


def test_distribution_fractional_commission() -> None:
    """Дробные проценты комиссии (например 25.50%)."""
    amount = 10_000
    blogger, worker, platform = calculate_distribution(
        amount, Decimal("25.50"), Decimal("5.25")
    )
    # floor(10000 * 25.50 / 100) = floor(2550.0) = 2550
    # floor(10000 * 5.25 / 100) = floor(525.0) = 525
    assert platform == 2550
    assert worker == 525
    assert blogger == 10_000 - 2550 - 525
    assert blogger + worker + platform == amount


def test_distribution_large_amount() -> None:
    """Большая сумма (100 000 000 копеек = 1 000 000 руб)."""
    amount = 100_000_000
    blogger, worker, platform = calculate_distribution(
        amount, Decimal("25.00"), Decimal("5.00")
    )
    assert platform == 25_000_000
    assert worker == 5_000_000
    assert blogger == 70_000_000
    assert blogger + worker + platform == amount


def test_distribution_minimum_amount() -> None:
    """Минимальная сумма (100 копеек = 1 рубль)."""
    amount = 100
    blogger, worker, platform = calculate_distribution(
        amount, Decimal("25.00"), Decimal("5.00")
    )
    assert platform == 25
    assert worker == 5
    assert blogger == 70
    assert blogger + worker + platform == amount


def test_distribution_all_shares_non_negative() -> None:
    """Все доли неотрицательны при максимальных комиссиях."""
    amount = 100
    blogger, worker, platform = calculate_distribution(
        amount, Decimal("50.00"), Decimal("30.00")
    )
    assert blogger >= 0
    assert worker >= 0
    assert platform >= 0
    assert blogger + worker + platform == amount
