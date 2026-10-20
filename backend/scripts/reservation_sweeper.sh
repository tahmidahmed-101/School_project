#!/bin/sh
# Periodically release checkout holds of unpaid orders past their expiry.
#
# Optional: checkout already frees expired holds on the stock it is about to
# reserve, so this only keeps the shown availability tidy between checkouts.
# Only orders still awaiting payment are swept -- never a confirmed or shipped
# one -- so no line that has shipped is touched.
#
# Started only via the `sweeper` compose profile (see docker-compose.prod.yml):
#   docker compose -f docker-compose.prod.yml --profile sweeper up -d
set -eu

INTERVAL="${RESERVATION_SWEEP_INTERVAL_SECONDS:-900}"

while true; do
    python manage.py release_expired_reservations || echo "sweep failed; retrying" >&2
    sleep "$INTERVAL"
done
