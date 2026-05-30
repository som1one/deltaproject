import enum

class UserRole(str, enum.Enum):
    """Роли из ТЗ: Worker, Bloger, Admin, Tech_Admin.

    Tech_Admin — расширенная административная роль с правами уровня Admin,
    за исключением управления другими административными учётными записями.
    """

    WORKER = "Worker"
    BLOGER = "Bloger"
    ADMIN = "Admin"
    TECH_ADMIN = "Tech_Admin"