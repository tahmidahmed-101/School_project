#!/bin/sh
# Periodically release checkout holds of unpaid orders past their expiry, and
# retry server-side conversion events (GA4 / Meta Purchase) that failed or were
# interrupted, and send the next batch of newsletter campaign email. Every
# command is safe to run any number of times.
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
    python manage.py send_conversion_events || echo "conversion retry failed; retrying" >&2
    python manage.py send_campaigns || echo "campaign batch failed; retrying" >&2
    sleep "$INTERVAL"
done
