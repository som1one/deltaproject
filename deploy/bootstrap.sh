#!/usr/bin/env bash
# Один прогон на чистом Ubuntu 24.04 (Noble). Готовит сервер под deploy:
#   · ставит пакеты (python3.12, node, nginx, postgres),
#   · создаёт deploy-юзера и кладёт ему ssh-ключ из аргумента,
#   · разворачивает репо в /opt/deltaproject, ставит зависимости,
#   · поднимает Postgres-БД app/app/app,
#   · регистрирует systemd-юниты бэка и фронта,
#   · ставит nginx-конфиг и (опционально) certbot.
#
# Не выключает парольный SSH сам — ты сделаешь это руками после того,
# как проверишь, что заходишь по ключу.
#
# Использование (под root):
#   bash deploy/bootstrap.sh "ssh-ed25519 AAAA... github-actions@deltaproject"
#
# Параметры через окружение (опционально):
#   REPO_URL=https://github.com/Som1one/deltaproject.git
#   APP_DIR=/opt/deltaproject
#   APP_DOMAIN=example.com   (если задан — попытаемся выпустить TLS через certbot)
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Запускайте под root: sudo bash deploy/bootstrap.sh \"<ssh-public-key>\"" >&2
  exit 1
fi

DEPLOY_KEY="${1:-}"
REPO_URL="${REPO_URL:-https://github.com/Som1one/deltaproject.git}"
APP_DIR="${APP_DIR:-/opt/deltaproject}"
APP_USER="${APP_USER:-deploy}"
APP_DB_NAME="${APP_DB_NAME:-app}"
APP_DB_USER="${APP_DB_USER:-app}"
APP_DB_PASS="${APP_DB_PASS:-app}"
APP_DOMAIN="${APP_DOMAIN:-}"

if [[ -z "${DEPLOY_KEY}" ]]; then
  echo "Передайте публичный ssh-ключ первым аргументом." >&2
  exit 1
fi

echo "[bootstrap] update + apt"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
    git curl ca-certificates gnupg \
    python3.12 python3.12-venv python3-pip build-essential \
    postgresql postgresql-contrib \
    nginx

# Node.js LTS из репы NodeSource (на Noble в стандарте npm не всегда совместим со свежим Next).
if ! command -v node >/dev/null || ! node -v | grep -qE '^v(20|22)\.'; then
  echo "[bootstrap] node 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "[bootstrap] user $APP_USER"
if ! id "$APP_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$APP_USER"
  usermod -aG sudo "$APP_USER"
fi

install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
echo "$DEPLOY_KEY" > "/home/$APP_USER/.ssh/authorized_keys"
chmod 600 "/home/$APP_USER/.ssh/authorized_keys"
chown -R "$APP_USER:$APP_USER" "/home/$APP_USER/.ssh"

echo "[bootstrap] folders"
install -d -m 755 -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
install -d -m 755 -o "$APP_USER" -g "$APP_USER" /var/log/deltaproject

echo "[bootstrap] git clone"
sudo -u "$APP_USER" -- bash -c "
    cd $APP_DIR
    if [[ ! -d .git ]]; then
        git clone $REPO_URL .
    else
        git fetch --all --prune
        git reset --hard origin/main
    fi
"

echo "[bootstrap] python venv + deps"
sudo -u "$APP_USER" -- bash -c "
    cd $APP_DIR
    [[ -d .venv ]] || python3.12 -m venv .venv
    .venv/bin/pip install --upgrade pip
    .venv/bin/pip install -r requirements.txt
"

echo "[bootstrap] postgres role + db"
# Создаём роль и базу, если их нет. Без падения, если уже есть.
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

echo "[bootstrap] .env (если ещё нет — копируем .env.example)"
sudo -u "$APP_USER" -- bash -c "
    cd $APP_DIR
    if [[ ! -f .env ]]; then
        cp .env.example .env
        # Подставим локальный postgres и сгенерим секреты, чтобы сервис стартовал.
        python3 - <<'PY'
import secrets, pathlib
p = pathlib.Path('.env')
text = p.read_text(encoding='utf-8')
def set_kv(text: str, key: str, value: str) -> str:
    out = []
    found = False
    for line in text.splitlines():
        if line.startswith(f'{key}='):
            out.append(f'{key}={value}')
            found = True
        else:
            out.append(line)
    if not found:
        out.append(f'{key}={value}')
    return '\n'.join(out) + '\n'
text = set_kv(text, 'DATABASE_URL', 'postgresql://$APP_DB_USER:$APP_DB_PASS@127.0.0.1:5432/$APP_DB_NAME')
text = set_kv(text, 'JWT_SECRET_KEY', secrets.token_urlsafe(64))
text = set_kv(text, 'REFRESH_TOKEN_SECRET_KEY', secrets.token_urlsafe(64))
text = set_kv(text, 'PAYOUT_CARD_PEPPER', secrets.token_urlsafe(32))
text = set_kv(text, 'APP_ENV', 'production')
p.write_text(text, encoding='utf-8')
PY
    fi
"

echo "[bootstrap] alembic upgrade head"
sudo -u "$APP_USER" -- bash -c "cd $APP_DIR && .venv/bin/python -m alembic upgrade head"

echo "[bootstrap] frontend deps + build"
# .env.local нужен Next.js в момент билда (NEXT_PUBLIC_*).
sudo -u "$APP_USER" -- bash -c "
    cd $APP_DIR/frontend
    if [[ ! -f .env.local ]]; then
        cat > .env.local <<EOF
NEXT_PUBLIC_API_BASE_URL=/api
NEXT_PUBLIC_APP_URL=${APP_DOMAIN:+https://$APP_DOMAIN}
EOF
        # Если домен не задан — пусть смотрит на сам сервер по http.
        if [[ -z '${APP_DOMAIN}' ]]; then
            sed -i 's#NEXT_PUBLIC_APP_URL=.*#NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000#' .env.local
        fi
    fi
    npm ci
    npm run build
"

echo "[bootstrap] systemd units"
cp "$APP_DIR/deploy/systemd/deltaproject-backend.service"  /etc/systemd/system/
cp "$APP_DIR/deploy/systemd/deltaproject-frontend.service" /etc/systemd/system/

# Право deploy перезапускать оба сервиса без пароля — нужно для GitHub Actions.
cat > /etc/sudoers.d/deltaproject <<'SUDOERS'
deploy ALL=(root) NOPASSWD: /bin/systemctl restart deltaproject-backend.service, /bin/systemctl restart deltaproject-frontend.service
SUDOERS
chmod 440 /etc/sudoers.d/deltaproject

systemctl daemon-reload
systemctl enable --now deltaproject-backend
systemctl enable --now deltaproject-frontend

echo "[bootstrap] nginx"
cp "$APP_DIR/deploy/nginx/deltaproject.conf" /etc/nginx/sites-available/deltaproject.conf
ln -sf /etc/nginx/sites-available/deltaproject.conf /etc/nginx/sites-enabled/deltaproject.conf
# Удаляем дефолтный сайт, если он есть.
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# certbot — только если домен передан и DNS уже указывает сюда.
if [[ -n "$APP_DOMAIN" ]]; then
  echo "[bootstrap] certbot for $APP_DOMAIN"
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "$APP_DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email || true
fi

echo "[bootstrap] health"
sleep 2
curl -fsS http://127.0.0.1:8000/health || echo "backend health-check failed"
echo
echo "Готово."
echo " · backend  : systemctl status deltaproject-backend"
echo " · frontend : systemctl status deltaproject-frontend"
echo " · nginx    : systemctl status nginx"
echo
echo "Дальше:"
echo " 1) Зайди под deploy по ключу: ssh -i deltaproject_deploy deploy@<host>"
echo " 2) Когда вход проверен — отключи парольный SSH:"
echo "    sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config"
echo "    sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config"
echo "    systemctl reload ssh"
echo " 3) Создай разово админа через ADMIN_BOOTSTRAP_* в .env и запусти:"
echo "    sudo -iu deploy bash -c 'cd $APP_DIR && .venv/bin/python -m utils.create_admin --name Admin --email admin@looney.local --password <pwd>'"
