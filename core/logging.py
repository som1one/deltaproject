import logging
import sys


def setup_logging(level: str = "INFO") -> None:
    """Настраивает корневой логгер один раз при старте приложения."""
    numeric = getattr(logging, level.upper(), logging.INFO)
    if not isinstance(numeric, int):
        numeric = logging.INFO

    root = logging.getLogger()
    root.setLevel(numeric)

    for h in root.handlers[:]:
        root.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(numeric)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s | %(levelname)-5s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    root.addHandler(handler)

    logging.getLogger("uvicorn.access").setLevel(numeric)
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if numeric <= logging.DEBUG else logging.WARNING
    )
