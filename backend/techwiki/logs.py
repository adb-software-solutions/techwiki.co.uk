"""Logging: one JSON object per line (for Loki), or plain text for local runs.

LOG_FORMAT=json, set in the Docker images, selects JSON. SERVICE_NAME names
the component in each line (the backend by default; the Celery images set
their own). Standard library only: gunicorn.conf.py imports this before
Django is set up.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from typing import Any

# Attributes every LogRecord has; anything else was passed with `extra=`
# (except Uvicorn's colour-coded copy of the message).
_STANDARD = set(vars(logging.makeLogRecord({}))) | {"message", "asctime", "color_message"}


class JsonFormatter(logging.Formatter):
    def __init__(self, service: str | None = None) -> None:
        super().__init__()
        self.service = service or os.environ.get("SERVICE_NAME") or "techwiki-backend"

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": record.getMessage(),
            "service": self.service,
        }
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        for key, value in vars(record).items():
            if key not in _STANDARD and not key.startswith("_"):
                entry[key] = (
                    value if isinstance(value, str | int | float | bool | None) else repr(value)
                )
        return json.dumps(entry, ensure_ascii=False)


def json_enabled() -> bool:
    return os.environ.get("LOG_FORMAT", "text").lower() == "json"


def logging_config(level: str = "INFO") -> dict[str, Any]:
    """settings.LOGGING: everything to stdout through the root logger."""
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "json": {"()": JsonFormatter},
            "text": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"},
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
                "formatter": "json" if json_enabled() else "text",
            },
        },
        "root": {"handlers": ["console"], "level": level.upper()},
        # Django's own console handler only prints when DEBUG is on; drop it
        # so its messages are not printed twice.
        "loggers": {"django": {"level": "INFO"}},
    }
