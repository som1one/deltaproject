from __future__ import annotations

import asyncio
import sys
import uuid
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select, text

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.database import dispose_db, get_session_factory, init_db
from core.settings import settings
from enums.user import UserRole
from models.blogger_profile import BloggerProfile
from models.marketplace_order import MarketplaceOrder
from models.marketplace_referral import MarketplaceReferral
from models.marketplace_settings import MarketplaceSettings
from models.user import User
from utils.security import hash_password

PASSWORD = "test12345"

BLOGGERS = [
    {
        "email": "anna.creator@test.local",
        "name": "Анна Смирнова",
        "nickname": "annasmirnova_est",
        "category": "lifestyle",
        "subscribers": 85_400,
        "price": 450_000,
        "description": "Авторский взгляд на современный дизайн интерьеров, минимализм в жизни и осознанное потребление. Работаю с премиум-сегментом и нативными интеграциями.",
        "social": ["https://t.me/annasmirnova_est", "https://instagram.com/annasmirnova_est"],
        "portfolio": ["https://example.com/cases/anna-interior"],
        "contact": "@annasmirnova_est",
    },
    {
        "email": "max.tech@test.local",
        "name": "Максим Коваль",
        "nickname": "koval_tech",
        "category": "tech",
        "subscribers": 320_000,
        "price": 280_000,
        "description": "Глубокие обзоры гаджетов, аналитика IT-рынка и интервью с фаундерами. Высокая вовлеченность B2B-аудитории.",
        "social": ["https://t.me/koval_tech", "https://youtube.com/@koval_tech"],
        "portfolio": ["https://example.com/cases/koval-saas"],
        "contact": "@koval_tech",
    },
    {
        "email": "elena.finance@test.local",
        "name": "Елена Романова",
        "nickname": "romanova_invest",
        "category": "business",
        "subscribers": 145_000,
        "price": 800_000,
        "description": "Сложные финансовые концепции простым языком: инвестиции, венчур, управление личным капиталом для предпринимателей.",
        "social": ["https://t.me/romanova_invest"],
        "portfolio": ["https://example.com/cases/romanova-finance"],
        "contact": "@romanova_invest",
    },
    {
        "email": "ilya.style@test.local",
        "name": "Илья Власов",
        "nickname": "vlasov_style",
        "category": "lifestyle",
        "subscribers": 58_000,
        "price": 520_000,
        "description": "Концептуальная мода, стайлинг и визуальная эстетика. Сотрудничаю с локальными и международными нишевыми брендами.",
        "social": ["https://t.me/vlasov_style", "https://instagram.com/vlasov_style"],
        "portfolio": ["https://example.com/cases/vlasov-fashion"],
        "contact": "@vlasov_style",
    },
    {
        "email": "mira.food@test.local",
        "name": "Мира Лебедева",
        "nickname": "mira_table",
        "category": "food",
        "subscribers": 24_600,
        "price": 180_000,
        "description": "Домашняя гастрономия, сервировка, городские рестораны и продукты с честной историей. Хорошо работают локальные бренды.",
        "social": ["https://t.me/mira_table"],
        "portfolio": ["https://example.com/cases/mira-food"],
        "contact": "@mira_table",
    },
    {
        "email": "sofia.travel@test.local",
        "name": "София Морозова",
        "nickname": "sofia_routes",
        "category": "travel",
        "subscribers": 512_000,
        "price": 950_000,
        "description": "Маршруты, бутик-отели, осмысленные путешествия и эстетичные тревел-гайды для аудитории 25-40.",
        "social": ["https://t.me/sofia_routes", "https://youtube.com/@sofia_routes"],
        "portfolio": ["https://example.com/cases/sofia-travel"],
        "contact": "@sofia_routes",
    },
]


async def get_or_create_user(
    db,
    *,
    email: str,
    name: str,
    role: UserRole,
    nickname: str,
    balance: int = 0,
    referred_by: uuid.UUID | None = None,
) -> User:
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None:
        user = User(
            id=uuid.uuid4(),
            name=name,
            email=email,
            nickname=nickname,
            telegram=f"@{nickname}" if nickname else None,
            hash_pass=hash_password(PASSWORD),
            percent=0.0,
            balance=0,
            is_active=True,
            role=role,
            marketplace_balance_kopeks=balance,
            marketplace_referred_by=referred_by,
        )
        db.add(user)
        await db.flush()
        return user

    user.name = name
    user.nickname = nickname
    user.telegram = f"@{nickname}" if nickname else user.telegram
    user.hash_pass = hash_password(PASSWORD)
    user.is_active = True
    user.role = role
    user.marketplace_balance_kopeks = balance
    if referred_by is not None:
        user.marketplace_referred_by = referred_by
    return user


async def main() -> None:
    init_db(settings.database_url)
    async with get_session_factory()() as db:
        for table in ["users", "blogger_profiles", "marketplace_settings", "marketplace_referrals", "marketplace_orders"]:
            await db.execute(text(f"select 1 from {table} limit 1"))

        if await db.get(MarketplaceSettings, 1) is None:
            db.add(
                MarketplaceSettings(
                    id=1,
                    platform_commission_pct=Decimal("25.00"),
                    worker_referral_commission_pct=Decimal("5.00"),
                )
            )

        worker = await get_or_create_user(
            db,
            email="worker.market@test.local",
            name="Тестовый воркер",
            role=UserRole.WORKER,
            nickname="test_worker_market",
            balance=125_000,
        )
        client = await get_or_create_user(
            db,
            email="client.market@test.local",
            name="Тестовый клиент",
            role=UserRole.CLIENT,
            nickname="test_client_market",
            referred_by=worker.id,
        )

        ref = (await db.execute(select(MarketplaceReferral).where(MarketplaceReferral.worker_id == worker.id))).scalar_one_or_none()
        if ref is None:
            db.add(MarketplaceReferral(worker_id=worker.id, ref_code="demo-worker"))
        else:
            ref.ref_code = "demo-worker"

        blogger_users: list[tuple[User, int]] = []
        for item in BLOGGERS:
            blogger = await get_or_create_user(
                db,
                email=item["email"],
                name=item["name"],
                role=UserRole.BLOGER,
                nickname=item["nickname"],
                balance=325_000,
            )
            blogger_users.append((blogger, item["price"]))

            profile = (await db.execute(select(BloggerProfile).where(BloggerProfile.user_id == blogger.id))).scalar_one_or_none()
            if profile is None:
                profile = BloggerProfile(
                    user_id=blogger.id,
                    category=item["category"],
                    subscriber_count=item["subscribers"],
                    average_price_kopeks=item["price"],
                    description=item["description"],
                    social_links=item["social"],
                )
                db.add(profile)

            profile.category = item["category"]
            profile.subscriber_count = item["subscribers"]
            profile.average_price_kopeks = item["price"]
            profile.description = item["description"]
            profile.social_links = item["social"]
            profile.portfolio_links = item["portfolio"]
            profile.photo_url = None
            profile.preferred_contact = item["contact"]
            profile.is_active = True
            profile.orders_enabled = True

        existing_orders = (await db.execute(select(MarketplaceOrder).where(MarketplaceOrder.client_id == client.id))).scalars().all()
        if not existing_orders:
            db.add_all(
                [
                    MarketplaceOrder(
                        client_id=client.id,
                        blogger_id=blogger_users[0][0].id,
                        worker_id=worker.id,
                        status="ESCROW_HELD",
                        amount_kopeks=blogger_users[0][1],
                        message="Тестовый заказ: нативная интеграция для новой коллекции.",
                        platform_commission_pct=Decimal("25.00"),
                        worker_commission_pct=Decimal("5.00"),
                    ),
                    MarketplaceOrder(
                        client_id=client.id,
                        blogger_id=blogger_users[1][0].id,
                        worker_id=worker.id,
                        status="BLOGGER_CONFIRMED",
                        amount_kopeks=blogger_users[1][1],
                        message="Тестовый заказ: обзор продукта с коротким CTA.",
                        platform_commission_pct=Decimal("25.00"),
                        worker_commission_pct=Decimal("5.00"),
                    ),
                ]
            )

        await db.commit()

        counts = {}
        for table in ["users", "blogger_profiles", "marketplace_orders", "marketplace_referrals"]:
            counts[table] = (await db.execute(text(f"select count(*) from {table}"))).scalar_one()

        print("Seed loaded")
        print(counts)
        print(f"Password for test accounts: {PASSWORD}")

    await dispose_db()


if __name__ == "__main__":
    asyncio.run(main())
