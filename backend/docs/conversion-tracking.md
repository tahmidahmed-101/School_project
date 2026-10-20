# Server-side conversion tracking

The storefront loads GA4 and the Meta Pixel itself (`frontend/modules/marketing/ui/AnalyticsScripts.tsx`)
and sends page views only. The backend adds the one event the browser cannot
know for certain: **Purchase**, once the order is really confirmed. It never
sends page views or any other browser event.

## When a Purchase is sent

When an order becomes **confirmed** for the first time, through any of:

| Path | Where |
| --- | --- |
| Cash on delivery accepted at checkout (no deposit due) | `payments.record_payment_due` |
| Payment (or a pre-order's deposit) captured | `payments.capture_payment` |
| Staff confirm the order by hand | `orders.set_order_status` |

All three call `payments._order_confirmed`, the hook that also scores the order
for fraud. Nothing is sent for a pending cart, an order awaiting payment, a
pre-order still waiting for its deposit, a cancelled order, or a submitted
checkout that never confirms. An order that goes back to confirmed later (a
consignment received back) does not count again.

## How it is delivered

`apps/marketing`: `ConversionEvent` is an outbox row per order, provider and
event, unique on that triple.

1. `record_purchase` writes the rows inside the confirming transaction, in its
   own savepoint: a failure there is logged and never undoes the confirmation.
   A rolled-back confirmation leaves no row.
2. After the commit, `transaction.on_commit(..., robust=True)` sends them. No
   HTTP call is made while a transaction or row lock is open, and a slow or
   failing provider cannot fail the request.
3. Each send first claims its row with one conditional `UPDATE`, so the commit
   hook and a retry run can never both send it.
4. `manage.py send_conversion_events` retries rows that are pending, failed
   (up to 6 attempts), or stuck mid-send for more than 15 minutes. The
   `sweeper` container runs it every 15 minutes (`scripts/reservation_sweeper.sh`);
   any cron that runs the command does the same job.

A send that reached the provider but whose reply was lost can be sent again by
a retry. The providers drop the copy: GA4 by `transaction_id` (the order
number), Meta by `event_id` (`purchase-<order id>`).

## What is sent

Totals come straight from the order, unchanged: `value` is `grand_total`, plus
`tax_total`, `shipping_total`, the coupon code and the business profile's
`currency_code`. Line items come from the order lines' own snapshot (SKU,
product name, variant title, unit price, quantity).

No name, email, phone, address or IP address is sent. Meta refuses an event
without any user data, so it gets one pseudonymous value: the SHA-256 of the
internal customer id (`external_id`). GA4 gets nothing that identifies the
shopper.

## Setup

Each provider can be configured two ways. Both stay off until complete
credentials are present; with neither, confirmation writes nothing.

### From the dashboard API (recommended)

Staff save the shop's own GA4 and Meta settings without touching the server.
Changes apply to the next send, including retries of events already waiting:
nothing is re-recorded or sent twice.

| Method | Path (`/api/v1/admin/settings/...`) | Permission |
| --- | --- | --- |
| GET | `conversion-tracking/` | `settings.view` (or `settings.manage`; admins always) |
| PATCH | `conversion-tracking/<ga4\|meta>/` | `settings.manage` |
| DELETE | `conversion-tracking/<ga4\|meta>/` | `settings.manage` |

PATCH body, every key optional after the first save:

| Field | GA4 | Meta |
| --- | --- | --- |
| `tracking_id` | Measurement ID, `G-XXXXXXXXXX` | Pixel ID, digits only |
| `secret` (write-only) | Measurement Protocol API secret | Conversions API access token |
| `test_event_code` | not accepted | Events Manager → Test events code; send `""` to clear |
| `is_enabled` | on / off | on / off |

- The first save of a provider must bring both `tracking_id` and `secret`
  (it is then switched on unless `is_enabled: false` is sent), or be exactly
  `{"is_enabled": false}` to switch an environment-configured provider off.
- Later saves change only what they send; leave `secret` out to keep it.
- A provider cannot be on without both values saved (`credentials_required`).
- `DELETE` removes the saved settings and hands the provider back to the
  environment variables.

Responses never contain a secret. Each provider reports:

| Field | Meaning |
| --- | --- |
| `source` | `dashboard` (saved settings decide), `environment` (env variables decide) or `none` |
| `is_active` | whether confirmed orders are being sent to it now |
| `is_enabled`, `tracking_id`, `test_event_code` | the settings in force (`tracking_id` is public by nature) |
| `secret_status` | `set`, `missing`, or `unreadable` (saved, but no configured key decrypts it) |
| `secret_updated_at`, `updated_at`, `updated_by_id` | when and by whom it was last saved |
| `environment_configured` | whether the env variables would cover it with nothing saved |
| `encryption_available` | whether the server can save secrets at all |

Every save and reset is written to the audit log with field names only — no
credential value is ever logged, audited or returned.

### Precedence

Per provider, and for the whole provider (never field by field):

1. Settings saved from the dashboard decide it — including `is_enabled: false`,
   which switches it off even when the environment variables are set.
2. With nothing saved, the environment variables apply, exactly as before this
   feature existed. An installation that never saves anything sees no change.
3. With neither, it is off.

### Secret storage

Saved secrets are encrypted with Fernet (AES-128-CBC + HMAC-SHA256) under the
server-only `SECRETS_ENCRYPTION_KEYS` (`apps/common/utils/secrets.py`):

- Generate a key with
  `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
  and set it on the API server only.
- Without it, saving a secret is refused (`encryption_key_missing`).
- Rotate by listing the new key first, comma-separated, then the old one; once
  each secret has been saved again, drop the old key.
- Losing the key makes saved secrets `unreadable`: those providers stop sending
  (their events fail and are retried) until the key is restored or the secret
  is saved again.

### From environment variables

| Variable | Where it comes from |
| --- | --- |
| `GA4_MEASUREMENT_ID` | The storefront's GA4 id (`G-XXXXXXXXXX`) |
| `GA4_API_SECRET` | GA4 Admin → Data streams → web stream → Measurement Protocol API secrets → Create |
| `META_PIXEL_ID` | The storefront's pixel id |
| `META_CAPI_ACCESS_TOKEN` | Events Manager → pixel → Settings → Conversions API → Generate access token |
| `META_GRAPH_API_VERSION` | Optional, defaults to `v21.0` (applies to both sources) |
| `META_TEST_EVENT_CODE` | Optional: Events Manager → Test events, to see events there while checking the setup. Remove it afterwards |

These are server-only. Never copy them into the frontend's `NEXT_PUBLIC_*`
settings. The GA4 secret travels in the request URL, which is why no URL is
ever logged; the Meta token travels in the request body.

### Retries and query cost

Each send reads every provider's settings in one query, once per batch, and
decrypts there — not per event or per line. Confirming an order costs the one
read of those settings plus its outbox rows. A provider switched on after an
order was confirmed does not receive that order: rows are owed only to the
providers that were active at confirmation.

## Known limits

- The browser's GA4 client id and Meta `_fbp` / `_fbc` cookies do not reach the
  backend, so a server Purchase is counted with its revenue but is not tied to
  the visit that placed it. GA4 gets a client id derived from the order; Meta
  gets `action_source: system_generated`.
- The browser sends no Purchase, so there is nothing to deduplicate against on
  that side. If a browser Purchase is added later, give it the same
  `event_id` (`purchase-<order id>`) and GA4 `transaction_id` (order number).
- A cancellation or refund after confirmation is not reported back.
- GA4 accepts back-dated events up to 72 hours old and Meta up to 7 days; a
  retry later than that lands at the time it is sent (GA4) or is refused (Meta).
