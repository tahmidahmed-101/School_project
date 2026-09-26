#!/bin/sh
# Periodically release stock reservations past their expiry.
#
# UNSAFE TO ENABLE until `manage.py backfill_shipped_reservations --apply` has
# been run: the sweeper calls the inventory-level release, so any reservation
# row still left ACTIVE on an already-shipped line would decrement
# StockItem.quantity_reserved a second time and oversell live stock.
#
# Started only via the `sweeper` compose profile (see docker-compose.prod.yml):
#   docker compose -f docker-compose.prod.yml --profile sweeper up -d
set -eu

INTERVAL="${RESERVATION_SWEEP_INTERVAL_SECONDS:-900}"

while true; do
    python manage.py release_expired_reservations || echo "sweep failed; retrying" >&2
    sleep "$INTERVAL"
done
