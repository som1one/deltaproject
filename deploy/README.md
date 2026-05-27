# Deploy

Готовый набор для разворачивания проекта на чистом Ubuntu 24.04 (Timeweb Cloud / любой VPS) с автоматической раскаткой через GitHub Actions при пуше в `main`.

## 0. Локально: один SSH-ключ для CI и для тебя

Сделай ключ один раз, сохрани приватный в менеджер паролей.

```powershell
ssh-keygen -t ed25519 -C "github-actions@deltaproject" -f $env:USERPROFILE\.ssh\deltaproject_deploy -N '""'
```

Появятся два файла:
- `~/.ssh/deltaproject_deploy` — приватный (в GitHub Secrets, в `DEPLOY_SSH_KEY`).
- `~/.ssh/deltaproject_deploy.pub` — публичный (его передаём в bootstrap).

## 1. На сервере: один прогон

Зайди под `root` (через SSH или VNC-консоль провайдера), потом:

```bash
# Клонируем только-только репо во временную папку, чтобы взять bootstrap.
cd /tmp
git clone https://github.com/Som1one/deltaproject.git
cd deltaproject

# Запускаем bootstrap. Первый аргумент — содержимое .pub-ключа.
sudo bash deploy/bootstrap.sh "ssh-ed25519 AAAA... github-actions@deltaproject"
```

Скрипт:
- ставит python3.12, node 20 LTS, postgres, nginx;
- заводит пользователя `deploy`, кладёт ему ssh-ключ;
- разворачивает репо в `/opt/deltaproject`;
- создаёт БД `app/app/app` и прогоняет `alembic upgrade head`;
- собирает фронт (`npm ci && npm run build`);
- регистрирует systemd-юниты `deltaproject-backend` и `deltaproject-frontend`;
- ставит nginx-конфиг (`/api` → 8000, `/` → 3000).

Параметры через окружение (опционально):
```bash
APP_DOMAIN=delta.example.com REPO_URL=... sudo bash deploy/bootstrap.sh "<pubkey>"
```

Если `APP_DOMAIN` задан и DNS уже указывает на VPS — bootstrap дополнительно выпустит TLS через certbot.

## 2. Проверка

```bash
ssh -i ~/.ssh/deltaproject_deploy deploy@<host>
curl -fsS http://127.0.0.1:8000/health
curl -fsS http://127.0.0.1:3000/
```

Если зашло по ключу и оба curl-а вернули осмысленный ответ — выключай парольный SSH:

```bash
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sudo systemctl reload ssh
```

Никогда не выключай парольный SSH **до** того, как проверил вход по ключу в отдельной новой сессии.

## 3. GitHub Secrets

Settings → Secrets and variables → Actions:

| Имя | Значение |
| --- | --- |
| `DEPLOY_HOST` | IP/домен VPS |
| `DEPLOY_PORT` | `22` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_PATH` | `/opt/deltaproject` |
| `DEPLOY_SSH_KEY` | весь приватный ключ `deltaproject_deploy`, включая `-----BEGIN…` и `-----END…` |

После этого каждый push в `main`:
1. Прогоняет `pytest` и `tsc --noEmit` в Actions.
2. Если зелёное — заходит на VPS под `deploy` по ключу.
3. Запускает `./deploy/remote-deploy.sh` (`git pull`, `pip install`, `alembic upgrade`, `npm ci && npm run build`, `systemctl restart`, health-check на `/health`).

## 4. Админ-учётка

После первого деплоя — заведи админа разово:

```bash
sudo -iu deploy bash -c '
  cd /opt/deltaproject &&
  .venv/bin/python -m utils.create_admin \
    --name Admin --email admin@looney.local --password "<your-password>"
'
```

Дальше можно входить в `/admin/login` под этой парой.

## 5. Если что-то пошло не так

- `systemctl status deltaproject-backend` / `…-frontend`
- `journalctl -u deltaproject-backend --no-pager -n 200`
- `tail -f /var/log/deltaproject/backend.err.log`
- `nginx -t && journalctl -u nginx --no-pager -n 200`
- `sudo -u deploy bash -lc 'cd /opt/deltaproject && .venv/bin/python main.py'` — поднять бэк руками без systemd, посмотреть лог в stdout.
