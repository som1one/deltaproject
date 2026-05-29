import enum


class DealStatus(str, enum.Enum):
    """Жизненный цикл сделки. Линейные переходы NEW→REVIEW→CONFIRMED→PAID→COMPLETED;
    из NEW или REVIEW админ может закрыть сделку как REJECTED."""

    NEW = "NEW"
    REVIEW = "REVIEW"
    CONFIRMED = "CONFIRMED"
    PAID = "PAID"
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"
