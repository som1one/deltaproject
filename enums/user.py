import enum

class UserRole(str, enum.Enum):
    """Роли из ТЗ: Worker, Bloger, Admin."""

    WORKER = "Worker"
    BLOGER = "Bloger"
    ADMIN = "Admin"