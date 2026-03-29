import enum


class DealStatus(str, enum.Enum):
    """Жизненный цикл сделки (линейные переходы)."""

    NEW = "NEW"
    REVIEW = "REVIEW"
    CONFIRMED = "CONFIRMED"
    PAID = "PAID"
    COMPLETED = "COMPLETED"
