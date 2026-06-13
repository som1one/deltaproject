#!/usr/bin/env bash
# Упрощённый bootstrap: всё под root, без отдельного deploy-юзера.
# Подходит, когда автодеплой ходит по SSH под root (пароль или ключ).
#
# Один прогон на чистом Ubuntu 24.04:
#   cd /tmp && git clone https://github.com/Som1one/deltaproject.git && cd deltaproject
#   sudo bash deploy/bootstrap-root.sh
#
# Параметры через окружение (опционально):
#   APP_DIR=/opt/deltaproject
#   APP_DB_NAME=app APP_DB_USER=app APP_DB_PASS=app
#   APP_DOMAIN=example.com   (если задан + DNS указывает сюда — выпустим TLS)
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Запускайте под root: sudo bash deploy/bootstrap-root.sh" >&2
  exit 1
fi

REPO_URL="${REPO_URL:-https://github.com/Som1one/deltaproject.git}"
APP_DIR="${APP_DIR:-/opt/deltaproject}"
APP_DB_NAME="${APP_DB_NAME:-app}"
APP_DB_USER="${APP_DB_USER:-app}"
APP_DB_PASS="${APP_DB_PASS:-app}"
APP_DOMAIN="${APP_DOMAIN:-}"

echo "[bootstrap] apt"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ca-certificates gnupg \
    python3.12 python3.12-venv python3-pip build-essential \
    postgresql postgresql-contrib nginx

if ! command -v node >/dev/null || ! node -v | grep -qE '^v(20|22)\.'; then
  echo "[bootstrap] node 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "[bootstrap] repo -> $APP_DIR"
mkdir -p "$APP_DIR" /var/log/deltaproject
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch --all --prune
  git -C "$APP_DIR" reset --hard origin/main
fi
cd "$APP_DIR"

echo "[bootstrap] python venv"
[[ -d .venv ]] || python3.12 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

echo "[bootstrap] postgres"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$APP_DB_USER') THEN
    CREATE ROLE $APP_DB_USER WITH LOGIN PASSWORD '$APP_DB_PASS';
  END IF;
END \$\$;
SQL
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '$APP_DB_NAME'" \
  | grep -q 1 || sudo -u postgres createdb -O "$APP_DB_USER" "$APP_DB_NAME"

echo "[bootstrap] .env"
if [[ ! -f .env ]]; then
  cp .env.example .env
  python3 - "$APP_DB_USER" "$APP_DB_PASS" "$APP_DB_NAME" <<'PY'
import secrets, sys, pathlib
db_user, db_pass, db_name = sys.argv[1], sys.argv[2], sys.argv[3]
p = pathlib.Path(".env")
text = p.read_text(encoding="utf-8")
def set_kv(text, key, value):
    out, found = [], False
    for line in text.splitlines():
        if line.startswith(f"{key}="):
            out.append(f"{key}={value}"); found = True
        else:
            out.append(line)
    if not found:
        out.append(f"{key}={value}")
    return "\n".join(out) + "\n"
text = set_kv(text, "DATABASE_URL", f"postgresql://{db_user}:{db_pass}@127.0.0.1:5432/{db_name}")
text = set_kv(text, "JWT_SECRET_KEY", secrets.token_urlsafe(64))
text = set_kv(text, "REFRESH_TOKEN_SECRET_KEY", secrets.token_urlsafe(64))
text = set_kv(text, "PAYOUT_CARD_PEPPER", secrets.token_urlsafe(32))
text = set_kv(text, "APP_ENV", "production")
p.write_text(text, encoding="utf-8")
print("[bootstrap] .env generated")
PY
fi

echo "[bootstrap] alembic upgrade"
.venv/bin/python -m alembic upgrade head

echo "[bootstrap] frontend build"
if [[ ! -f frontend/.env.local ]]; then
  if [[ -n "$APP_DOMAIN" ]]; then
    cat > frontend/.env.local <<EOF
NEXT_PUBLIC_API_BASE_URL=/api
NEXT_PUBLIC_APP_URL=https://$APP_DOMAIN
EOF
  else
    cat > frontend/.env.local <<EOF
NEXT_PUBLIC_API_BASE_URL=/api
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
EOF
  fi
fi
( cd frontend && npm ci && npm run build )

echo "[bootstrap] systemd units (User=root)"
cat > /etc/systemd/system/deltaproject-backend.service <<UNIT
[Unit]
Description=looney moon — FastAPI backend
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=$APP_DIR/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips '*'
Restart=on-failure
RestartSec=3
StandardOutput=append:/var/log/deltaproject/backend.log
StandardError=append:/var/log/deltaproject/backend.err.log

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/deltaproject-frontend.service <<UNIT
[Unit]
Description=looney moon — Next.js frontend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR/frontend
EnvironmentFile=$APP_DIR/frontend/.env.local
ExecStart=/usr/bin/npm run start -- -p 3000
Restart=on-failure
RestartSec=3
StandardOutput=append:/var/log/deltaproject/frontend.log
StandardError=append:/var/log/deltaproject/frontend.err.log

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now deltaproject-backend
systemctl enable --now deltaproject-frontend

echo "[bootstrap] nginx"
cp "$APP_DIR/deploy/nginx/deltaproject.conf" /etc/nginx/sites-available/deltaproject.conf
ln -sf /etc/nginx/sites-available/deltaproject.conf /etc/nginx/sites-enabled/deltaproject.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

if [[ -n "$APP_DOMAIN" ]]; then
  echo "[bootstrap] certbot for $APP_DOMAIN"
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "$APP_DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email || true
fi

echo "[bootstrap] health"
sleep 2
curl -fsS http://127.0.0.1:8000/health || echo "backend health-check failed"
echo
echo "Готово. Сервисы:"
echo "  systemctl status deltaproject-backend"
echo "  systemctl status deltaproject-frontend"
echo "  systemctl status nginx"
echo
echo "Создай админа:"
echo "  cd $APP_DIR && .venv/bin/python -m utils.create_admin --name Admin --email admin@looney.local --password '<pwd>'"
cd $APP_DIR && .venv/bin/python -m utils.create_admin --name Admin --email admin@looney.local --password 'deltaadmin'"ju?VrxtaXiznE5