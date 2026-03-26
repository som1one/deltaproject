# Backend (скелет)

Каркас структуры FastAPI + асинхронный PostgreSQL + Alembic. Модули `core`, `models`, `routers`, `services`, `utils` и `main.py` пока содержат только текстовые описания назначения — без исполняемого кода приложения.

## Структура

- `core/` — настройки, логирование, исключения, конфиг, БД
- `models/` — модели SQLAlchemy
- `routers/` — маршруты API
- `services/` — бизнес-логика
- `utils/` — вспомогательные функции
- `main.py` — точка входа приложения (план)
- `alembic/` — миграции (инициализировано)
- `alembic.ini` — конфигурация Alembic

## Быстрый старт окружения

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## PostgreSQL (Docker)

```bash
docker compose up -d postgres
```

Параметры по умолчанию совпадают с шаблоном в `.env` (пользователь `app`, БД `app`).

## Переменные окружения

Создайте файл `.env` в каталоге `backend` (переменные из раздела ниже). Файл `.env` в `.gitignore` и в репозиторий не попадает.

Пример содержимого `.env`:

```env
APP_ENV=development
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=app
POSTGRES_PASSWORD=app
POSTGRES_DB=app
DATABASE_URL=postgresql+asyncpg://app:app@localhost:5432/app
ALEMBIC_SYNC_URL=postgresql+psycopg://app:app@localhost:5432/app
```

`alembic.ini` уже указывает на ту же БД, что и `docker-compose.yml`. При смене пароля или хоста обновите и compose, и `sqlalchemy.url` в ini (или вынесите чтение URL в `alembic/env.py`).

## Alembic

Инициализация уже выполнена (`alembic init`). Пустая ревизия: `alembic/versions/`.

Примеры команд (из каталога `backend`, активированное venv):

```bash
alembic current
alembic history
alembic upgrade head
```

Перед применением миграций задайте реальный URL в `alembic.ini` или доработайте `alembic/env.py` для чтения из переменных окружения.

## Зависимости

См. `requirements.txt`: FastAPI, Uvicorn, SQLAlchemy asyncio, asyncpg, Alembic, pydantic-settings, python-dotenv.
