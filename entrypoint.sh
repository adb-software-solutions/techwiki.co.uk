#!/bin/bash
set -e

python manage.py collectstatic --noinput

# Prometheus multiprocess mode for the Gunicorn workers (gunicorn.conf.py):
# an empty directory on every start, for the server only (commands run with
# docker exec do not inherit it).
export PROMETHEUS_MULTIPROC_DIR=/tmp/prometheus-multiproc
rm -rf "$PROMETHEUS_MULTIPROC_DIR"
mkdir -p "$PROMETHEUS_MULTIPROC_DIR"

exec "$@"
