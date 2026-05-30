import enum


class DealStatus(str, enum.Enum):
    """Жизненный цикл сделки.

    Линейные переходы NEW→REVIEW→CONFIRMED→ESCROW_HELD→PAID→COMPLETED:
    из CONFIRMED админ подтверждает получение средств (ESCROW_HELD), затем
    распределяет доли участникам (PAID). Из NEW, REVIEW или CONFIRMED админ
    может закрыть сделку как REJECTED; собранные, но не распределённые средства
    возвращаются как REFUNDED. REJECTED и REFUNDED — терминальные статусы.
    """

    NEW = "NEW"
    REVIEW = "REVIEW"
    CONFIRMED = "CONFIRMED"
    ESCROW_HELD = "ESCROW_HELD"  # средства собраны и удерживаются платформой
    PAID = "PAID"  # доли распределены участникам
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"  # отклонена до сбора средств
    REFUNDED = "REFUNDED"  # собранные средства возвращены до распределения
