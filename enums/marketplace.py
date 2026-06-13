import enum


class MarketplaceOrderStatus(str, enum.Enum):
    """Order statuses for the blogger marketplace."""

    PENDING_PAYMENT = "PENDING_PAYMENT"
    PAYMENT_FAILED = "PAYMENT_FAILED"
    ESCROW_HELD = "ESCROW_HELD"
    BLOGGER_CONFIRMED = "BLOGGER_CONFIRMED"
    COMPLETED = "COMPLETED"
    REFUNDED = "REFUNDED"


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
