#!/bin/bash
set -e

export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.production}"

# Other containers on the compose network (e.g. the storefront's SSR/build-time
# fetches) reach this one by its container IP, which changes on every
# recreate — so it can't live in the static ALLOWED_HOSTS in .env. Add
# whatever IP this container actually has, and its own hostname, at boot.
CONTAINER_IP="$(hostname -i 2>/dev/null | awk '{print $1}')"
if [ -n "$CONTAINER_IP" ]; then
    export ALLOWED_HOSTS="${ALLOWED_HOSTS:+$ALLOWED_HOSTS,}${CONTAINER_IP},$(hostname)"
fi

python manage.py migrate --noinput
# Idempotent; the database cache backend needs this table to exist before the
# first throttled request, and REDIS_URL deployments simply ignore it.
python manage.py createcachetable
python manage.py collectstatic --noinput --clear

# Gunicorn defaults to a single worker, which serializes every request behind
# the slowest one — a report query would stall the whole dashboard. Scale with
# WEB_CONCURRENCY (the convention most platforms set for you); 3 is a sane
# floor for a small instance.
#
# Access and error logs go to stdout/stderr so the platform's log collector
# picks them up; by default gunicorn writes no access log at all, leaving
# requests invisible in production.
exec gunicorn config.wsgi:application \
    --bind "0.0.0.0:${PORT:-8000}" \
    --workers "${WEB_CONCURRENCY:-3}" \
    --timeout "${GUNICORN_TIMEOUT:-60}" \
    --max-requests "${GUNICORN_MAX_REQUESTS:-1000}" \
    --max-requests-jitter "${GUNICORN_MAX_REQUESTS_JITTER:-100}" \
    --access-logfile - \
    --error-logfile -
