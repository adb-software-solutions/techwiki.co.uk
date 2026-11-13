from typing import cast

from django.conf import settings
from django.db import connections
from django.db.backends.postgresql.base import DatabaseWrapper
from django.test import TestCase


def pool_options() -> dict[str, float]:
    options = cast(dict[str, object], settings.DATABASES["default"]["OPTIONS"])
    return cast(dict[str, float], options["pool"])


class DatabasePoolTests(TestCase):
    """Requests share a bounded pool of Postgres connections, so a burst of
    traffic waits for a free one instead of exhausting max_connections."""

    def test_pool_is_bounded(self) -> None:
        options = pool_options()
        self.assertGreater(options["max_size"], 0)
        self.assertLessEqual(options["min_size"], options["max_size"])
        self.assertGreater(options["timeout"], 0)

    def test_queries_use_the_pool(self) -> None:
        db = connections["default"]
        assert isinstance(db, DatabaseWrapper)
        with db.cursor() as cursor:
            cursor.execute("SELECT 1")
            self.assertEqual(cursor.fetchone(), (1,))
        self.assertIsNotNone(db.pool)
        assert db.pool is not None
        self.assertEqual(db.pool.max_size, pool_options()["max_size"])
