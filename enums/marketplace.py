import enum


class MarketplaceOrderStatus(str, enum.Enum):
    """Order statuses for the blogger marketplace.

    Полный цикл: оффер (из чата или карточки) → принятие исполнителем →
    оплата → работа (сроки тикают) → сдача работы → 3 дня на приёмку →
    завершение с распределением средств.
    """

    OFFER_PENDING = "OFFER_PENDING"  # предложение отправлено, ждёт принятия
    OFFER_DECLINED = "OFFER_DECLINED"  # контрагент отклонил предложение
    PENDING_PAYMENT = "PENDING_PAYMENT"
    PAYMENT_FAILED = "PAYMENT_FAILED"
    ESCROW_HELD = "ESCROW_HELD"  # оплачено, работа в процессе
    BLOGGER_CONFIRMED = "BLOGGER_CONFIRMED"  # работа сдана, ждёт приёмки заказчиком
    COMPLETED = "COMPLETED"
    REFUNDED = "REFUNDED"
    CANCELLED = "CANCELLED"


class AudienceSubmissionStatus(str, enum.Enum):
    """Статусы заявки автора на подтверждение статистики аудитории."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class PremiumRequestStatus(str, enum.Enum):
    """Статусы заявки на премиум-размещение на главной."""

    NEW = "new"
    CONTACTED = "contacted"
    CLOSED = "closed"


class BloggerCategory(str, enum.Enum):
    """Blogger categories exposed in marketplace filters."""

    LIFESTYLE = "lifestyle"
    TECH = "tech"
    BEAUTY = "beauty"
    FOOD = "food"
    TRAVEL = "travel"
    FITNESS = "fitness"
    GAMING = "gaming"
    EDUCATION = "education"
    BUSINESS = "business"
    ENTERTAINMENT = "entertainment"
    OTHER = "other"

    @property
    def label(self) -> str:
        return format_blogger_category_label(self.value)


class SupportTicketStatus(str, enum.Enum):
    """Support ticket statuses."""

    OPEN = "open"
    RESOLVED = "resolved"


class SupportTicketSubject(str, enum.Enum):
    """Тема обращения в поддержку. DISPUTE требует сделку, остальные — нет."""

    DISPUTE = "dispute"
    PAYMENT = "payment"
    TECHNICAL = "technical"
    GENERAL = "general"


class WithdrawalStatus(str, enum.Enum):
    """Withdrawal request statuses."""

    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


BLOGGER_CATEGORY_LABELS: dict[str, str] = {
    BloggerCategory.LIFESTYLE.value: "Lifestyle",
    BloggerCategory.TECH.value: "Tech & IT",
    BloggerCategory.BEAUTY.value: "Красота",
    BloggerCategory.FOOD.value: "Еда",
    BloggerCategory.TRAVEL.value: "Путешествия",
    BloggerCategory.FITNESS.value: "Фитнес",
    BloggerCategory.GAMING.value: "Игры",
    BloggerCategory.EDUCATION.value: "Образование",
    BloggerCategory.BUSINESS.value: "Бизнес",
    BloggerCategory.ENTERTAINMENT.value: "Развлечения",
    BloggerCategory.OTHER.value: "Другое",
}


def format_blogger_category_label(value: str) -> str:
    """Return a human-friendly label for a marketplace blogger category."""

    known = BLOGGER_CATEGORY_LABELS.get(value)
    if known:
        return known

    normalized = value.replace("_", " ").replace("-", " ").strip()
    if not normalized:
        return value

    return " ".join(part[:1].upper() + part[1:] for part in normalized.split())
