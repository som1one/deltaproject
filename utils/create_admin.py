import argparse
import asyncio

from sqlalchemy import select

from core.database import dispose_db, get_session_factory, init_db
from core.settings import settings
from enums.user import UserRole
from models.user import User
from utils.security import hash_password


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Создает или обновляет единственного администратора платформы.",
    )
    parser.add_argument("--name", required=True, help="Имя администратора")
    parser.add_argument("--email", required=True, help="Email администратора")
    parser.add_argument("--password", required=True, help="Пароль администратора")
    parser.add_argument("--telegram", default=None, help="Telegram (опционально)")
    return parser.parse_args()


async def create_or_update_single_admin(
    name: str,
    email: str,
    password: str,
    telegram: str | None,
) -> None:
    init_db(settings.database_url)
    factory = get_session_factory()
    try:
        async with factory() as db:
            admin_result = await db.execute(
                select(User).where(User.role == UserRole.ADMIN).with_for_update()
            )
            admin = admin_result.scalar_one_or_none()

            email_result = await db.execute(select(User).where(User.email == email))
            email_owner = email_result.scalar_one_or_none()

            if email_owner is not None and (admin is None or email_owner.id != admin.id):
                raise RuntimeError("Этот email уже занят другим пользователем")

            if admin is None:
                admin = User(
                    name=name,
                    email=email,
                    telegram=telegram,
                    hash_pass=hash_password(password),
                    role=UserRole.ADMIN,
                    linked_to=None,
                )
                db.add(admin)
                action = "created"
            else:
                admin.name = name
                admin.email = email
                admin.telegram = telegram
                admin.hash_pass = hash_password(password)
                action = "updated"

            await db.commit()
            await db.refresh(admin)
            print(f"Admin {action}: id={admin.id}, email={admin.email}")
    finally:
        await dispose_db()


async def main() -> None:
    args = parse_args()
    await create_or_update_single_admin(
        name=args.name.strip(),
        email=args.email.strip().lower(),
        password=args.password,
        telegram=args.telegram.strip() if isinstance(args.telegram, str) else None,
    )


if __name__ == "__main__":
    asyncio.run(main())
