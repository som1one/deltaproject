"""Эффективная сумма сделки для начислений."""

from types import SimpleNamespace

from services.deal_service import deal_distribution_amount_kopeks


def test_uses_agreed_when_set() -> None:
    d = SimpleNamespace(agreed_price_kopeks=55_00, price=99_00)
    assert deal_distribution_amount_kopeks(d) == 55_00


def test_falls_back_to_price() -> None:
    d = SimpleNamespace(agreed_price_kopeks=None, price=99_00)
    assert deal_distribution_amount_kopeks(d) == 99_00
