#!/usr/bin/env bash
# Стартовый скрипт для Railway/Render/Fly.
# 1. Гонит миграции alembic (синхронно через psycopg).
# 2. Один раз заводит администратора, если переданы ADMIN_BOOTSTRAP_*.
# 3. Запускает uvicorn на $PORT.
set -euo pipefail

echo "[startup] running alembic migrations…"
alembic upgrade head

if [[ -n "${ADMIN_BOOTSTRAP_EMAIL:-}" && -n "${ADMIN_BOOTSTRAP_PASSWORD:-}" ]]; then
  echo "[startup] ensuring admin user (${ADMIN_BOOTSTRAP_EMAIL})…"
  python -m utils.create_admin \
    --name   "${ADMIN_BOOTSTRAP_NAME:-Admin}" \
    --email  "${ADMIN_BOOTSTRAP_EMAIL}" \
    --password "${ADMIN_BOOTSTRAP_PASSWORD}" \
    --telegram "${ADMIN_BOOTSTRAP_TELEGRAM:-}"
fi

PORT="${PORT:-8000}"
echo "[startup] launching uvicorn on 0.0.0.0:${PORT}…"
exec uvicorn main:app --host 0.0.0.0 --port "${PORT}" --proxy-headers --forwarded-allow-ips '*'
