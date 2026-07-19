"""Тексты об отключённом аккаунте для auth-потоков.

Бан (banned_at != None) и обычная деактивация используют один механизм
(is_active=False), но пользователю показываются по-разному.
"""

from models.user import User


def account_blocked_detail(user: User) -> str:
    if user.banned_at is not None:
        if user.ban_reason:
            return f"Аккаунт заблокирован администрацией. Причина: {user.ban_reason}"
        return "Аккаунт заблокирован администрацией"
    return "Аккаунт деактивирован"
