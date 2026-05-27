#!/usr/bin/env bash
# Запускается на сервере под deploy-пользователем.
# Идемпотентно подтягивает свежий main, обновляет зависимости, гонит миграции
# и перезапускает systemd-юниты бэка и фронта.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(pwd)}"
PYTHON_BIN="${PYTHON_BIN:-$REPO_DIR/.venv/bin/python}"
NPM_BIN="${NPM_BIN:-npm}"
BACKEND_UNIT="${BACKEND_UNIT:-deltaproject-backend.service}"
FRONTEND_UNIT="${FRONTEND_UNIT:-deltaproject-frontend.service}"

echo "[deploy] repo: $REPO_DIR"
cd "$REPO_DIR"

echo "[deploy] git pull"
git fetch --all --prune
git reset --hard origin/main

echo "[deploy] python deps"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

echo "[deploy] alembic upgrade"
"$PYTHON_BIN" -m alembic upgrade head

echo "[deploy] frontend build"
cd frontend
$NPM_BIN ci
$NPM_BIN run build
cd ..

echo "[deploy] restart services"
sudo -n systemctl restart "$BACKEND_UNIT"
sudo -n systemctl restart "$FRONTEND_UNIT"

echo "[deploy] health check"
for i in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:8000/health >/dev/null; then
    echo "[deploy] backend healthy"
    exit 0
  fi
  sleep 2
done

echo "[deploy] backend failed health-check" >&2
exit 1
