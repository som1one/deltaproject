"""End-to-end smoke по жизненному циклу сделки.

Покрывает три роли:
  · worker  — создаёт заявку, читает её в /me/deals
  · blogger — принимает (NEW → REVIEW)
  · admin   — CONFIRMED → PAID → COMPLETED, плюс подтверждает запрос воркера на выплату

JWT для воркера выдаём напрямую через utils.jwt_tokens (на проде его
выдаёт Telegram OAuth). Для блогера — через POST /auth/blogger-login,
для админа — через /auth/admin-login.

Запуск (бэкенд + Postgres должны быть подняты):

  .venv\\Scripts\\python.exe -m scripts.deal_smoke

Параметры по умолчанию:
  --base-url           http://127.0.0.1:8000
  --admin-email        admin@looney.local
  --admin-password     fSDh3SmgiPWT3bBS
  --blogger-nickname   test_blogger_alpha
  --blogger-password   подставится из stdin или флагом

Если ник/пароль блогера не подходят — скрипт перевыпустит блогера
через scripts.seed_test_blogger.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
import uuid
from typing import Any

import httpx
from sqlalchemy import select

from core.database import dispose_db, get_session_factory, init_db
from core.settings import settings
from enums.user import UserRole
from models.user import User
from utils.jwt_tokens import create_access_token


def _normalize_dsn(url: str) -> str:
    if not url:
        return url
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


class SmokeError(RuntimeError):
    pass


def _step(label: str, ok: bool, detail: str = "") -> None:
    mark = "✓" if ok else "✗"
    print(f" {mark} {label}{(' — ' + detail) if detail else ''}")
    if not ok:
        raise SmokeError(label)


async def _bootstrap_worker_token() -> tuple[uuid.UUID, str]:
    """Берём первого активного воркера и выписываем ему JWT."""
    init_db(_normalize_dsn(settings.database_url))
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(User).where(User.role == UserRole.WORKER, User.is_active == True).limit(1),  # noqa: E712
        )
        worker = result.scalar_one_or_none()
        if worker is None:
            raise SmokeError("Нет ни одного активного воркера. Сначала прогоните seed.")
        token = create_access_token(worker.id)
    await dispose_db()
    return worker.id, token


async def _admin_login(client: httpx.AsyncClient, email: str, password: str) -> str:
    r = await client.post("/auth/admin-login", json={"email": email, "password": password})
    if r.status_code != 200:
        raise SmokeError(f"admin-login failed: {r.status_code} {r.text}")
    return r.json()["token"]


async def _blogger_login(
    client: httpx.AsyncClient,
    nickname: str,
    password: str,
) -> str:
    r = await client.post(
        "/auth/blogger-login",
        json={"nickname": nickname, "password": password},
    )
    if r.status_code != 200:
        raise SmokeError(f"blogger-login failed ({nickname}): {r.status_code} {r.text}")
    return r.json()["token"]


async def main(args: argparse.Namespace) -> int:
    print(f"Smoke against {args.base_url}")
    print()

    # Подготовим воркер-токен
    worker_id, worker_token = await _bootstrap_worker_token()
    print(f"Worker: {worker_id} (token issued via JWT helper)")

    transport = httpx.AsyncHTTPTransport(retries=0)
    async with httpx.AsyncClient(base_url=args.base_url, transport=transport, timeout=10.0) as client:
        # ---- 0. Health
        r = await client.get("/health")
        _step("/health", r.status_code == 200, f"status {r.status_code}")

        # ---- 1. Worker: подтянуть себя и список доступных блогеров
        worker_headers = {"Authorization": f"Bearer {worker_token}"}
        r = await client.get("/me", headers=worker_headers)
        _step("worker /me", r.status_code == 200, r.json().get("name", ""))
        me_data: dict[str, Any] = r.json()

        r = await client.get("/me/available-bloggers", headers=worker_headers)
        bloggers = r.json() if r.status_code == 200 else []
        _step(
            "worker /me/available-bloggers",
            r.status_code == 200 and len(bloggers) > 0,
            f"items={len(bloggers)}",
        )
        target_blogger = next(
            (b for b in bloggers if b.get("nickname") == args.blogger_nickname),
            bloggers[0],
        )
        bloger_id = target_blogger["id"]

        # ---- 2. Worker: создаёт сделку
        item_marker = f"Smoke item {uuid.uuid4().hex[:6]}"
        r = await client.post(
            "/deals",
            headers=worker_headers,
            json={
                "shop_link": "https://example-shop.example/smoke",
                "item_name": item_marker,
                "seller_tg": "@smoke_seller",
                "seller_number": "+79991110000",
                "price": 990000,  # 9 900 ₽
                "bloger_id": bloger_id,
            },
        )
        _step(
            "worker POST /deals",
            r.status_code in (200, 201),
            f"status {r.status_code}",
        )
        deal = r.json()
        deal_id = deal["id"]

        # ---- 3. Worker: проверяет, что сделка появилась в /me/deals со статусом NEW
        r = await client.get("/me/deals", headers=worker_headers)
        deals_list = r.json().get("deals", []) if r.status_code == 200 else []
        new_deal = next((d for d in deals_list if d["id"] == deal_id), None)
        _step(
            "worker /me/deals contains the new deal as NEW",
            new_deal is not None and new_deal.get("status") == "NEW",
            f"status={new_deal.get('status') if new_deal else 'missing'}",
        )

        # ---- 4. Blogger: логинится, видит заявку и принимает её
        blogger_token = await _blogger_login(client, args.blogger_nickname, args.blogger_password)
        blogger_headers = {"Authorization": f"Bearer {blogger_token}"}

        r = await client.get("/me/deals", headers=blogger_headers)
        blogger_deals = r.json().get("deals", []) if r.status_code == 200 else []
        b_deal = next((d for d in blogger_deals if d["id"] == deal_id), None)
        _step(
            "blogger sees the deal in /me/deals",
            b_deal is not None,
            f"status={b_deal.get('status') if b_deal else 'missing'}",
        )

        r = await client.patch(
            f"/deals/{deal_id}",
            headers=blogger_headers,
            json={"status": "REVIEW"},
        )
        _step(
            "blogger PATCH /deals/{id} NEW → REVIEW",
            r.status_code == 200 and r.json().get("status") == "REVIEW",
            f"status {r.status_code}",
        )

        # ---- 5. Admin: REVIEW → CONFIRMED
        admin_token = await _admin_login(client, args.admin_email, args.admin_password)
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        r = await client.patch(
            f"/admin/deals/{deal_id}/status",
            headers=admin_headers,
            json={"status": "CONFIRMED", "reason": "smoke: подтверждаем"},
        )
        _step(
            "admin REVIEW → CONFIRMED",
            r.status_code == 200 and r.json().get("status") == "CONFIRMED",
            f"status {r.status_code}",
        )

        # ---- 6. Admin: CONFIRMED → PAID (тут происходят начисления)
        r = await client.patch(
            f"/admin/deals/{deal_id}/status",
            headers=admin_headers,
            json={"status": "PAID", "reason": "smoke: оплата"},
        )
        _step(
            "admin CONFIRMED → PAID (accruals fire)",
            r.status_code == 200 and r.json().get("status") == "PAID",
            f"status {r.status_code}",
        )

        # ---- 7. Worker: проверяет ledger — должна быть запись completed по этой сделке
        r = await client.get("/me/ledger", headers=worker_headers)
        items = r.json().get("items", []) if r.status_code == 200 else []
        accrual = next(
            (
                item for item in items
                if item.get("deal_id") == deal_id and item.get("status") == "completed"
            ),
            None,
        )
        accrued = (accrual or {}).get("amount_kopeks", 0)
        _step(
            "worker /me/ledger has accrual for the deal",
            accrual is not None and accrued > 0,
            f"+{accrued / 100:.2f}₽" if accrual else "missing",
        )

        # ---- 8. Admin: PAID → COMPLETED (закрывает сделку, обновляет stats)
        r = await client.patch(
            f"/admin/deals/{deal_id}/status",
            headers=admin_headers,
            json={"status": "COMPLETED", "reason": "smoke: закрываем"},
        )
        _step(
            "admin PAID → COMPLETED",
            r.status_code == 200 and r.json().get("status") == "COMPLETED",
            f"status {r.status_code}",
        )

        # ---- 9. Worker: запрашивает выплату на сумму начисления
        # У воркера может быть и фоновый баланс с прошлых сидов — берём минимум.
        r = await client.get("/me", headers=worker_headers)
        balance = r.json().get("balance", 0) if r.status_code == 200 else 0
        # Привяжем ему карту, если ещё не привязана.
        if not r.json().get("payout_card_last4"):
            await client.post(
                "/me/payout-card",
                headers=worker_headers,
                json={"card_number": "2200000000000004"},  # Luhn-валидный fake-номер MIR
            )
        payout_kopeks = max(min(balance, accrued or 1_00), 1_00)
        r = await client.post(
            "/me/payout-requests",
            headers=worker_headers,
            json={"amount_kopeks": payout_kopeks, "payout_token": None},
        )
        _step(
            "worker POST /me/payout-requests",
            r.status_code in (200, 201),
            f"-{payout_kopeks / 100:.2f}₽",
        )
        payout_entry_id = r.json().get("id") if r.status_code in (200, 201) else None

        # ---- 10. Admin: завершает выплату
        if payout_entry_id:
            r = await client.post(
                f"/admin/payouts/{payout_entry_id}/complete",
                headers=admin_headers,
            )
            _step(
                "admin POST /admin/payouts/{id}/complete",
                r.status_code == 200 and r.json().get("status") == "completed",
                f"status {r.status_code}",
            )
        else:
            _step("admin payout complete", False, "no payout entry id")

    print()
    print("All deal-lifecycle smoke checks passed ✓")
    return 0


def cli() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--admin-email", default="admin@looney.local")
    parser.add_argument("--admin-password", default="fSDh3SmgiPWT3bBS")
    parser.add_argument("--blogger-nickname", default="test_blogger_alpha")
    parser.add_argument(
        "--blogger-password",
        required=False,
        default=None,
        help="Если не задан — выдаст seed_test_blogger и используем его пароль",
    )
    args = parser.parse_args()

    if not args.blogger_password:
        # Перевыпускаем тестового блогера и забираем свежий пароль из вывода seed.
        from scripts.seed_test_blogger import (
            main as seed_main,
        )

        async def reseed() -> str:
            # seed_test_blogger.main печатает пароль в stdout — печать не критична,
            # тут нам нужен возвращаемый pwd. Перепишем под прямой вызов утилит:
            from utils.blogger_credentials import (
                build_blogger_internal_email,
                generate_blogger_password,
                normalize_blogger_nickname,
            )
            from utils.security import hash_password
            from sqlalchemy import select as _select

            init_db(_normalize_dsn(settings.database_url))
            factory = get_session_factory()
            password = generate_blogger_password()
            try:
                async with factory() as db:
                    nickname = normalize_blogger_nickname(args.blogger_nickname)
                    res = await db.execute(_select(User).where(User.nickname == nickname))
                    user = res.scalar_one_or_none()
                    if user is None:
                        user = User(
                            id=uuid.uuid4(),
                            name=args.blogger_nickname,
                            email=build_blogger_internal_email(nickname),
                            nickname=nickname,
                            telegram=None,
                            hash_pass=hash_password(password),
                            role=UserRole.BLOGER,
                        )
                        db.add(user)
                    else:
                        user.hash_pass = hash_password(password)
                    await db.commit()
            finally:
                await dispose_db()
            return password

        del seed_main  # silence unused
        args.blogger_password = asyncio.run(reseed())
        print(f"(reset blogger password for {args.blogger_nickname})")

    try:
        rc = asyncio.run(main(args))
    except SmokeError as exc:
        print(f"\n✗ smoke FAILED: {exc}")
        rc = 1
    sys.exit(rc)


if __name__ == "__main__":
    cli()
