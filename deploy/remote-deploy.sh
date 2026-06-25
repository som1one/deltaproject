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
MARKETPLACE_UNIT="${MARKETPLACE_UNIT:-deltaproject-marketplace.service}"

echo "[deploy] repo: $REPO_DIR"
cd "$REPO_DIR"

# Под root sudo не нужен; под обычным юзером — sudo -n (NOPASSWD).
if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo -n"
fi

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

echo "[deploy] marketplace build"
# Ensure .env.local exists BEFORE build (Next.js inlines NEXT_PUBLIC_* at build time)
MARKETPLACE_DOMAIN="marketplace.looneymoon.ru"
if [[ ! -f marketplace/.env.local ]]; then
  echo "[deploy] creating marketplace/.env.local"
  cat > marketplace/.env.local << EOF
NEXT_PUBLIC_API_BASE_URL=http://37.220.80.62:8000
NEXT_PUBLIC_APP_URL=https://$MARKETPLACE_DOMAIN
NEXT_PUBLIC_MAIN_APP_URL=http://looneymoon.ru
EOF
fi
cd marketplace
$NPM_BIN ci
$NPM_BIN run build
cd ..

# --- Marketplace one-time infra setup (idempotent) ---

# Install systemd unit if not present
if [[ ! -f /etc/systemd/system/deltaproject-marketplace.service ]]; then
  echo "[deploy] installing marketplace systemd unit"
  $SUDO cp deploy/deltaproject-marketplace.service /etc/systemd/system/
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable deltaproject-marketplace.service
fi

# Install nginx config if not present
if [[ ! -f /etc/nginx/sites-available/marketplace ]]; then
  echo "[deploy] installing marketplace nginx config"
  $SUDO cp deploy/nginx-marketplace.conf /etc/nginx/sites-available/marketplace
  $SUDO ln -sf /etc/nginx/sites-available/marketplace /etc/nginx/sites-enabled/marketplace
  $SUDO nginx -t && $SUDO systemctl reload nginx
fi

# Issue SSL cert if not yet obtained
if [[ ! -d /etc/letsencrypt/live/$MARKETPLACE_DOMAIN ]]; then
  echo "[deploy] obtaining SSL certificate for $MARKETPLACE_DOMAIN"
  $SUDO certbot --nginx -d "$MARKETPLACE_DOMAIN" --non-interactive --agree-tos --email admin@looneymoon.ru --redirect || echo "[deploy] certbot failed (DNS may not be ready yet)"
fi

echo "[deploy] restart services"
$SUDO systemctl restart "$BACKEND_UNIT"
$SUDO systemctl restart "$FRONTEND_UNIT"
$SUDO systemctl restart "$MARKETPLACE_UNIT"

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
