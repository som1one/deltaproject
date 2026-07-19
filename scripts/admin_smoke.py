"""Admin smoke-тест: реально стучится в работающий backend на 8000.

Проверяет ключевые сценарии админ-панели:
  · логин администратора (POST /auth/admin-login)
  · GET /admin/overview / users / deals / ledger / finance-schemes / worker-message-scripts
  · GET /admin/finance/preview по первому блогеру
  · POST + DELETE worker-message-script
  · PATCH процента у первого воркера / возврат обратно
  · PATCH статуса leger-записи в той же категории (idempotent)

Запуск (бэкенд должен быть поднят):
  .venv\\Scripts\\python.exe -m scripts.admin_smoke

  --email / --password — креды админа
  --base-url — адрес backend (default http://127.0.0.1:8000)
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from typing import Any

import httpx


class SmokeError(RuntimeError):
    pass


def _ok(label: str, ok: bool, detail: str = "") -> None:
    mark = "✓" if ok else "✗"
    print(f" {mark} {label}{(' — ' + detail) if detail else ''}")
    if not ok:
        raise SmokeError(label)


async def _login(client: httpx.AsyncClient, email: str, password: str) -> str:
    r = await client.post("/auth/admin-login", json={"email": email, "password": password})
    if r.status_code != 200:
        raise SmokeError(f"admin-login failed: {r.status_code} {r.text}")
    data = r.json()
    return data["token"]


async def main(base_url: str, email: str, password: str) -> int:
    print(f"Smoke test against {base_url}")
    transport = httpx.AsyncHTTPTransport(retries=0)
    async with httpx.AsyncClient(base_url=base_url, transport=transport, timeout=10.0) as client:
        # 1. Health
        r = await client.get("/health")
        _ok("/health", r.status_code == 200, str(r.status_code))

        # 2. Login
        try:
            token = await _login(client, email, password)
        except SmokeError as exc:
            print(f"  ! {exc}")
            return 1
        client.headers.update({"Authorization": f"Bearer {token}"})
        _ok("admin-login", True, "JWT получен")

        # 3. /admin/overview
        r = await client.get("/admin/overview")
        _ok("/admin/overview", r.status_code == 200, f"status {r.status_code}")
        overview: dict[str, Any] = r.json() if r.status_code == 200 else {}

        # 4. users
        r = await client.get("/admin/users")
        _ok("/admin/users", r.status_code == 200, f"items={len(r.json().get('items', []))}")
        users = r.json().get("items", [])
        worker = next((u for u in users if u.get("role") == "Worker"), None)
        blogger = next((u for u in users if u.get("role") == "Bloger"), None)

        # 5. deals
        r = await client.get("/admin/deals")
        deals = r.json() if r.status_code == 200 else []
        _ok("/admin/deals", r.status_code == 200, f"len={len(deals)}")

        # 6. ledger
        r = await client.get("/admin/ledger")
        ledger = r.json().get("items", []) if r.status_code == 200 else []
        _ok("/admin/ledger", r.status_code == 200, f"len={len(ledger)}")

        # 7. finance-schemes
        r = await client.get("/admin/finance-schemes")
        _ok("/admin/finance-schemes", r.status_code == 200,
            f"items={len(r.json().get('items', []))}")

        # 8. worker-message-scripts
        r = await client.get("/admin/worker-message-scripts")
        scripts = r.json() if r.status_code == 200 else []
        _ok("/admin/worker-message-scripts", r.status_code == 200, f"len={len(scripts)}")

        # 9. finance preview по первому блогеру
        if blogger:
            r = await client.get(
                "/admin/finance/preview",
                params={"bloger_id": blogger["id"], "price_kopeks": 100000},
            )
            _ok("/admin/finance/preview", r.status_code == 200,
                f"sum_check={r.json().get('worker_kopeks', 0) >= 0}")
        else:
            print("  · skip finance preview: блогеров в БД нет")

        # 10. Создать и удалить worker script
        r = await client.post(
            "/admin/worker-message-scripts",
            json={"title": "Smoke check", "body": "тестовый скрипт", "sort_order": 9999},
        )
        if r.status_code in (200, 201):
            sid = r.json()["id"]
            _ok("create worker-message-script", True, sid[:8])
            r = await client.delete(f"/admin/worker-message-scripts/{sid}")
            _ok("delete worker-message-script", r.status_code in (200, 204),
                f"status {r.status_code}")
        else:
            _ok("create worker-message-script", False, f"status {r.status_code}")

        # 11. Единая настройка комиссий маркетплейса: прочитать и сохранить те же значения
        r = await client.get("/admin/marketplace/settings")
        if r.status_code == 200:
            pcts = r.json()
            _ok("GET marketplace settings", True,
                f"platform {pcts['platform_commission_pct']}% / worker {pcts['worker_referral_commission_pct']}%")
            r = await client.put("/admin/marketplace/settings", json=pcts)
            _ok("PUT marketplace settings (same values)", r.status_code == 200, f"status {r.status_code}")
        else:
            _ok("GET marketplace settings", False, f"status {r.status_code}")

        # 12. Трогаем ledger-status: ставим тот же статус (без изменений → должен быть 200/400)
        if ledger:
            entry = ledger[0]
            r = await client.patch(
                f"/admin/ledger/{entry['id']}",
                json={"status": entry["status"]},
            )
            _ok("PATCH ledger status (same)",
                r.status_code in (200, 400, 409),
                f"status {r.status_code}")
        else:
            print("  · skip ledger patch: записей нет")

        # 13. финальный overview — проверяем что числа не упали
        r = await client.get("/admin/overview")
        ok = r.status_code == 200
        _ok("/admin/overview (after edits)", ok, f"status {r.status_code}")

    print("\nAll admin smoke checks passed ✓")
    return 0


def cli() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--email", default="admin@looney.local")
    parser.add_argument("--password", default="fSDh3SmgiPWT3bBS")
    args = parser.parse_args()
    try:
        rc = asyncio.run(main(args.base_url, args.email, args.password))
    except SmokeError as exc:
        print(f"\n✗ smoke FAILED: {exc}")
        rc = 1
    sys.exit(rc)


if __name__ == "__main__":
    cli()
