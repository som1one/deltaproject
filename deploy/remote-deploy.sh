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

# Гарантируем swap: два npm ci + два Next-билда подряд съедают память и без
# swap ловят OOM-killer (SIGKILL, exit 137). Идемпотентно, не валит деплой.
ensure_swap() {
  # Уже есть активный swap? — ничего не делаем (/proc/swaps: >1 строки = есть).
  if [[ -r /proc/swaps && "$(wc -l < /proc/swaps)" -gt 1 ]]; then
    return 0
  fi
  echo "[deploy] нет активного swap — поднимаю 2G swapfile"
  if [[ ! -e /swapfile ]]; then
    $SUDO fallocate -l 2G /swapfile 2>/dev/null \
      || $SUDO dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    $SUDO chmod 600 /swapfile
    $SUDO mkswap /swapfile >/dev/null
  fi
  $SUDO swapon /swapfile
  if ! grep -q '^/swapfile[[:space:]]' /etc/fstab 2>/dev/null; then
    echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null
  fi
  $SUDO swapon --show || true
}
ensure_swap || echo "[deploy] swap не поднялся — продолжаю (мало прав?); при OOM добавьте swap вручную"

# ─────────────────────────────────────────────────────────────────────────
# Входящие вебхуки Telegram.
#
# Симптом блокировки: getWebhookInfo отдаёт last_error_message="Connection
# timed out" и растущий pending_update_count, при этом та же точка снаружи
# отвечает за доли секунды. То есть режется конкретно трафик от подсетей
# Telegram — обычно fail2ban после серии запросов или закрытый ufw.
#
# Правила только разрешающие и идемпотентные. Блок целиком под `set +e`:
# диагностика firewall'а не имеет права уронить деплой (наверху set -e).
# ─────────────────────────────────────────────────────────────────────────
TELEGRAM_NETS="149.154.160.0/20 91.108.4.0/22"

allow_telegram_inbound() {
  (
    set +e
    echo "[deploy] telegram inbound: диагностика"

    if command -v ufw >/dev/null 2>&1; then
      echo "[deploy]   ufw:"
      $SUDO ufw status 2>/dev/null | head -20 | sed 's/^/[deploy]     /'
      for net in $TELEGRAM_NETS; do
        if $SUDO ufw allow from "$net" comment "telegram webhook" >/dev/null 2>&1; then
          echo "[deploy]   ufw allow $net — ок"
        else
          echo "[deploy]   ufw allow $net — не применилось"
        fi
      done
    else
      echo "[deploy]   ufw не установлен"
    fi

    if command -v fail2ban-client >/dev/null 2>&1; then
      echo "[deploy]   fail2ban:"
      $SUDO fail2ban-client status 2>/dev/null | sed 's/^/[deploy]     /'
      jails=$($SUDO fail2ban-client status 2>/dev/null \
        | sed -n 's/.*Jail list:[[:space:]]*//p' | tr -d ' ' | tr ',' ' ')
      for jail in $jails; do
        banned=$($SUDO fail2ban-client status "$jail" 2>/dev/null \
          | sed -n 's/.*Banned IP list:[[:space:]]*//p')
        case "$banned" in
          *149.154.*|*91.108.*)
            echo "[deploy]   !! в jail $jail забанены адреса Telegram" ;;
        esac
        for net in $TELEGRAM_NETS; do
          $SUDO fail2ban-client set "$jail" unbanip "$net" >/dev/null 2>&1
        done
      done
      echo "[deploy]   fail2ban: разбан подсетей Telegram выполнен"
    else
      echo "[deploy]   fail2ban не установлен"
    fi
  ) || true
}
allow_telegram_inbound

echo "[deploy] git pull"
git fetch --all --prune
git reset --hard origin/main

# Главный домен сайта. От него зависят redirect-URL'ы Telegram OAuth в .env:
# .env деплоем не перезаписывается, поэтому при переезде домена они остались на
# старом (looneymoon.ru). Вход при этом не падал, но уносил пользователя на
# чужой origin: JWT ложился в localStorage старого домена, и на новом сайте
# юзер оставался гостем. Синхронизируем только эти два ключа, остальное .env
# не трогаем.
MAIN_DOMAIN="${MAIN_DOMAIN:-moneymaxxxing.ru}"

# Точечно правит ключ в env-файле (по умолчанию $REPO_DIR/.env) — только если
# значение разъехалось. Отсутствующий файл — no-op (тогда работает дефолт кода).
sync_env_kv() {
  local key="$1" value="$2" file="${3:-$REPO_DIR/.env}"
  local current
  [[ -f "$file" ]] || return 0
  if ! grep -qE "^$key=" "$file"; then
    printf '%s=%s\n' "$key" "$value" >> "$file"
    echo "[deploy] .env: добавил $key=$value"
    return 0
  fi
  current=$(grep -m1 -E "^$key=" "$file" | cut -d= -f2-)
  if [[ "$current" != "$value" ]]; then
    sed -i "s#^$key=.*#$key=$value#" "$file"
    echo "[deploy] .env: $key: $current → $value"
  fi
}

echo "[deploy] telegram oauth urls → $MAIN_DOMAIN"
sync_env_kv TELEGRAM_OAUTH_REDIRECT_URI "https://$MAIN_DOMAIN/api/auth/telegram/callback"
sync_env_kv TELEGRAM_OAUTH_FRONTEND_CALLBACK_URL "https://$MAIN_DOMAIN/tg/callback"

# Канонический домен маркетплейса. Из него бэкенд строит реф-ссылки воркеров,
# return_url ЮKassa, allow-list redirect_uri SSO-входа блогера и ссылку
# админ-импersonation; главный сайт — кнопку «в маркетплейс» (вшивается в билд).
echo "[deploy] marketplace canonical domain → marketplace.moneymaxxxing.ru"
sync_env_kv MARKETPLACE_FRONTEND_URL "https://marketplace.moneymaxxxing.ru"
sync_env_kv NEXT_PUBLIC_MARKETPLACE_URL "https://marketplace.moneymaxxxing.ru" "$REPO_DIR/frontend/.env.local"

echo "[deploy] python deps"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

echo "[deploy] alembic upgrade"
"$PYTHON_BIN" -m alembic upgrade head

# Скрипты сообщений воркеров: идемпотентный сид (вставляет недостающие по
# title, чистит легаси-набор; админ-правки существующих текстов не трогает).
echo "[deploy] seed worker scripts"
"$PYTHON_BIN" -m scripts.seed_worker_scripts \
  || echo "[deploy] seed_worker_scripts не отработал — кабинеты живут со старым набором, посмотрите лог"

echo "[deploy] frontend build"
cd frontend
$NPM_BIN ci
$NPM_BIN run build
cd ..

echo "[deploy] marketplace build"
# Next.js инлайнит NEXT_PUBLIC_* на этапе БИЛДА, поэтому .env.local должен быть
# верным ДО сборки. Пишем его ВСЕГДА (не "если нет") — иначе старый файл с
# http://IP:8000 переживёт деплой и фронт словит mixed-content ("Failed to
# fetch": HTTPS-сайт не может дёргать HTTP-API).
#
# API — того же origin: nginx проксирует /api/* → 127.0.0.1:8000 (снимая /api),
# что покрывает и /marketplace/*, и /auth/* (SSO-обмен блогера), и /me — без
# коллизий с фронтовыми /auth/*-страницами. Базовый URL = https://<домен>/api,
# без http://IP:8000, без mixed-content и без CORS.
MARKETPLACE_DOMAIN="marketplace.moneymaxxxing.ru"
echo "[deploy] writing marketplace/.env.local"
cat > marketplace/.env.local << EOF
NEXT_PUBLIC_API_BASE_URL=https://$MARKETPLACE_DOMAIN/api
NEXT_PUBLIC_APP_URL=https://$MARKETPLACE_DOMAIN
NEXT_PUBLIC_MAIN_APP_URL=https://$MAIN_DOMAIN
EOF
cd marketplace
$NPM_BIN ci
$NPM_BIN run build
cd ..

# --- Marketplace one-time infra setup (idempotent) ---

# Install systemd unit if not present
if ! $SUDO diff -q deploy/deltaproject-marketplace.service /etc/systemd/system/deltaproject-marketplace.service &>/dev/null 2>&1; then
  echo "[deploy] installing/updating marketplace systemd unit"
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

# Идемпотентно доносим /api/ прокси в ЖИВОЙ конфиг. Файл мог быть переписан
# certbot (443-блок + редирект), поэтому НЕ перезаписываем шаблоном (снесли бы
# SSL) — а дописываем location, только если его ещё нет. Вставляем после
# server_name (в обоих блоках; в :80-редиректе он безвреден). Трейлинг-слэш в
# proxy_pass снимает /api перед проксированием на бэк.
NGINX_CONF=/etc/nginx/sites-available/marketplace
if [[ -f "$NGINX_CONF" ]] && ! $SUDO grep -q 'location /api/' "$NGINX_CONF"; then
  echo "[deploy] injecting /api/ proxy into live nginx conf"
  $SUDO sed -i '/server_name marketplace.looneymoon.ru;/a\    location /api/ { proxy_pass http://127.0.0.1:8000/; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }' "$NGINX_CONF"
  if $SUDO nginx -t; then
    $SUDO systemctl reload nginx
  else
    echo "[deploy] WARNING: nginx -t failed after injecting /api/ proxy — не перезагружаю, проверьте конфиг вручную" >&2
  fi
fi

# Issue SSL cert if not yet obtained
if [[ ! -d /etc/letsencrypt/live/$MARKETPLACE_DOMAIN ]]; then
  echo "[deploy] obtaining SSL certificate for $MARKETPLACE_DOMAIN"
  # Install certbot if missing
  if ! command -v certbot &>/dev/null; then
    echo "[deploy] installing certbot..."
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq certbot python3-certbot-nginx
  fi
  $SUDO certbot --nginx -d "$MARKETPLACE_DOMAIN" --non-interactive --agree-tos --email admin@looneymoon.ru --redirect || echo "[deploy] certbot failed (DNS may not be ready yet)"
fi

# --- Домен marketplace.moneymaxxxing.ru: bootstrap конфига и сертификата ---
# На свежем сервере: ставим стартовый конфиг (:80), certbot выпускает ОТДЕЛЬНЫЙ
# лейнедж (--expand по чужим лейнеджам запрещён) и дописывает 443. Канонический
# вид обоих доменов затем приводит canonical_switch ниже. Оба шага идемпотентны;
# пока DNS-записи нет, certbot мягко падает и повторяется следующим деплоем.
MARKETPLACE_ALIAS="marketplace.moneymaxxxing.ru"
ALIAS_CONF=/etc/nginx/sites-available/marketplace-moneymaxxxing
if [[ ! -f "$ALIAS_CONF" ]]; then
  echo "[deploy] installing marketplace alias nginx config ($MARKETPLACE_ALIAS)"
  $SUDO cp deploy/nginx-marketplace-moneymaxxxing.conf "$ALIAS_CONF"
  $SUDO ln -sf "$ALIAS_CONF" /etc/nginx/sites-enabled/marketplace-moneymaxxxing
  if $SUDO nginx -t; then
    $SUDO systemctl reload nginx
  else
    echo "[deploy] WARNING: nginx -t failed после alias-конфига — откатываю его" >&2
    $SUDO rm -f /etc/nginx/sites-enabled/marketplace-moneymaxxxing "$ALIAS_CONF"
  fi
fi
if [[ -f "$ALIAS_CONF" && ! -d /etc/letsencrypt/live/$MARKETPLACE_ALIAS ]]; then
  echo "[deploy] obtaining SSL certificate for $MARKETPLACE_ALIAS (отдельный лейнедж)"
  $SUDO certbot --nginx --cert-name "$MARKETPLACE_ALIAS" -d "$MARKETPLACE_ALIAS" --non-interactive --agree-tos --email admin@looneymoon.ru --redirect \
    || echo "[deploy] certbot для $MARKETPLACE_ALIAS не прошёл (DNS-запись ещё не создана?) — повторится следующим деплоем"
fi

# --- Переворот канона: маркетплейс живёт на marketplace.moneymaxxxing.ru ---
# Новый домен сервит приложение; старый marketplace.looneymoon.ru — 301 на
# новый, но /api/ и /marketplace/ на нём ПРОДОЛЖАЮТ проксироваться: туда
# смотрит вебхук ЮKassa и возможные легаси-интеграции (POST не переживёт 301).
# Идемпотентно по маркеру «canonical:» в живых файлах; требует оба LE-лейнеджа
# и certbot-обвязку — иначе откладывается до следующего деплоя. nginx -t
# с откатом из бэкапов; деплой из-за этого шага не валим.
CANON_MARK="# canonical: marketplace.moneymaxxxing.ru"
NGX_NEW=/etc/nginx/sites-available/marketplace-moneymaxxxing
NGX_OLD=/etc/nginx/sites-available/marketplace
canonical_switch() {
  if $SUDO grep -qsF "$CANON_MARK" "$NGX_NEW" && $SUDO grep -qsF "$CANON_MARK" "$NGX_OLD"; then
    return 0
  fi
  local f missing=0
  for f in \
    /etc/letsencrypt/live/marketplace.moneymaxxxing.ru/fullchain.pem \
    /etc/letsencrypt/live/marketplace.looneymoon.ru/fullchain.pem \
    /etc/letsencrypt/options-ssl-nginx.conf \
    /etc/letsencrypt/ssl-dhparams.pem
  do
    if ! $SUDO test -f "$f"; then
      echo "[deploy] canonical-switch: нет $f — шаг отложен до следующего деплоя"
      missing=1
    fi
  done
  if [[ "$missing" -eq 1 ]]; then
    return 0
  fi
  local ts
  ts=$(date +%s)
  $SUDO cp -a "$NGX_NEW" "$NGX_NEW.bak.$ts" 2>/dev/null || true
  $SUDO cp -a "$NGX_OLD" "$NGX_OLD.bak.$ts" 2>/dev/null || true
  $SUDO cp deploy/nginx-marketplace-canonical.conf "$NGX_NEW"
  $SUDO cp deploy/nginx-marketplace-redirect.conf "$NGX_OLD"
  $SUDO ln -sf "$NGX_NEW" /etc/nginx/sites-enabled/marketplace-moneymaxxxing
  $SUDO ln -sf "$NGX_OLD" /etc/nginx/sites-enabled/marketplace
  if $SUDO nginx -t; then
    $SUDO systemctl reload nginx
    echo "[deploy] canonical-switch: готово — канон marketplace.moneymaxxxing.ru, старый домен редиректит"
  else
    echo "[deploy] WARNING: canonical-switch: nginx -t упал — откатываю из бэкапов" >&2
    if $SUDO test -f "$NGX_NEW.bak.$ts"; then $SUDO cp -a "$NGX_NEW.bak.$ts" "$NGX_NEW"; fi
    if $SUDO test -f "$NGX_OLD.bak.$ts"; then $SUDO cp -a "$NGX_OLD.bak.$ts" "$NGX_OLD"; fi
    { $SUDO nginx -t && $SUDO systemctl reload nginx; } || true
  fi
}
canonical_switch || echo "[deploy] canonical-switch пропущен из-за ошибки — прежняя схема доменов продолжает работать"

echo "[deploy] restart services"
$SUDO systemctl restart "$BACKEND_UNIT"
$SUDO systemctl restart "$FRONTEND_UNIT"
$SUDO systemctl restart "$MARKETPLACE_UNIT" || echo "[deploy] marketplace service failed to start (check journalctl)"

echo "[deploy] health check"
for i in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:8000/health >/dev/null; then
    echo "[deploy] backend healthy"
    # Вебхук Telegram-бота уведомлений: сервер регистрирует его сам, секрет
    # производный от JWT_SECRET_KEY (см. telegram_bot_webhook_secret_effective)
    echo "[deploy] telegram bot webhook"
    "$PYTHON_BIN" -m scripts.set_telegram_webhook \
      || echo "[deploy] set_telegram_webhook не отработал — бот без вебхука, посмотрите лог"
    exit 0
  fi
  sleep 2
done

echo "[deploy] backend failed health-check" >&2
exit 1
