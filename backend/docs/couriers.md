# Bangladeshi courier integrations

Implemented in `apps/logistics/services/couriers/`. This note records which
documentation each gateway was written against, and — more importantly — what
could **not** be verified, so the next person does not mistake an inference for
a documented contract.

Researched and implemented **2026-08-14**.

## Where credentials live

Credentials come from the `Carrier` **model row**, not from settings/env. That
was the pre-existing design (`Carrier.api_key` / `api_secret` /
`webhook_secret`, written through the admin API as `type: "password"`
write-only fields) and it is what supports more than one account per provider.
**No new environment variables were added.**

`Carrier.config` (JSONField, added by migration `0004_carrier_config`) holds the
per-provider settings that the fixed credential columns cannot: store ids, area
ids, sandbox selection. It is write-only through the admin API — the serializer
exposes `config_keys` (names) but never values, because Pathao's merchant
password lives there.

| Provider | `api_key` | `api_secret` | `config` keys |
|---|---|---|---|
| Pathao | `client_id` | `client_secret` | `username`, `password`, `store_id` (required); `sandbox`, `delivery_type`, `item_type`, `special_instruction`, `default_item_weight_kg` |
| Steadfast | `Api-Key` | `Secret-Key` | `note`, `delivery_type` |
| RedX | static JWT | unused | `delivery_area_id` **or** `area_id_by_city` (required); `delivery_area`, `pickup_store_id`, `instruction`, `parcel_category`, `cancel_reason`, `sandbox`, `default_parcel_weight_grams` |

`api_base_url` on the carrier, when set, overrides the provider default host —
that is the escape hatch if a provider moves.

## Return contract

`create_consignment` / `get_tracking_status` return `status` as a
`Shipment.Status` value and the untranslated provider string as
`provider_status`. When a provider status has no safe domain equivalent,
`status` is `""` and the caller leaves the shipment's status alone. **An
unrecognised status must never be coerced onto a domain status** — a stale
status is recoverable, a wrong terminal status is not.

## Pathao Courier

- Sandbox `https://courier-api-sandbox.pathao.com`, production
  `https://api-hermes.pathao.com`, all paths under `/aladdin/api/v1`.
- OAuth2 `POST /issue-token`, `grant_type=password` with
  `client_id`/`client_secret`/`username`/`password`. Token TTL is `expires_in`
  (5 days); cached per carrier with a 5-minute safety margin, and re-issued
  exactly once on a 401 before the call is retried.
- Order create `POST /orders`; `consignment_id` is at `data.consignment_id`.
- `recipient_city` / `recipient_zone` / `recipient_area` are deliberately
  **omitted** so Pathao auto-resolves them from the address. Sending an explicit
  `null` is rejected. The lookup helpers (`list_cities`, `list_zones`,
  `list_areas`, `list_stores`) exist so `store_id` can be looked up rather than
  guessed.

**Sources.** Pathao's own portal
(<https://merchant.pathao.com/courier/developer-api>) is login-gated and could
not be fetched. The contract above is reconstructed from four independent
third-party implementations in three languages that agree field-for-field:
[Sifat07/pathao-merchant-sdk](https://github.com/Sifat07/pathao-merchant-sdk)
(carries a transcription of the dashboard docs),
[mojnomiya/pathao-python](https://github.com/mojnomiya/pathao-python),
[codeboxrcodehub/pathao-courier](https://github.com/codeboxrcodehub/pathao-courier),
[enuenan/pathao-courier](https://github.com/enuenan/pathao-courier).

**Not verified — treat with suspicion:**

1. **The `order_status` vocabulary.** No source enumerates it; only `"Pending"`
   is confirmed. `STATUS_MAP` in `pathao.py` is keyed on Pathao's published
   *webhook event names*, normalised (lower, `_`/space → `-`). The assumption
   that `order_status` uses the same slugs is **an inference, not documented.**
   Unknown values map to `""` so the blast radius is a stale status.
2. **The status path.** `/orders/{cid}/info` (2 sources) vs `/orders/{cid}`
   (1 older source). We use `/info`.
3. **Rate limiting.** No documented 429 contract, no known `Retry-After`. We
   classify a 429 and stop; we do not retry.
4. **Production host.** One of four sources says `courier-api.pathao.com`; the
   other three say `api-hermes.pathao.com`, which is what we use.
5. **Cancel.** No confirmed cancel endpoint, so `cancel_consignment` raises
   `cancel_not_supported` rather than calling a guessed path.

Settle 1–3 by running the sandbox with Pathao's public test credentials and
logging raw responses. That is worth more than any further web searching.

## Steadfast Courier

Best documented of the three; implemented against **API Documentation V1**.

- Base URL `https://portal.packzy.com/api/v1`. **No sandbox exists** — there is
  nowhere safe to smoke-test this one.
- Auth is a static `Api-Key` / `Secret-Key` header pair. No token exchange.
- `POST /create_order`; `consignment.consignment_id` and
  `consignment.tracking_code`.
- **Failures come back with an HTTP 200 and a `status` field in the body**
  (200/400/401), so `steadfast.py` branches on the body, not the transport
  status. Validation errors are a Laravel-style `errors: {field: [msg]}` map.
- `GET /status_by_cid/{id}` → `{"delivery_status": ...}`. The 11-value
  vocabulary is closed and fully mapped; a test asserts the map matches it
  exactly, so a future API addition fails loudly.
- Cancel is modelled as `POST /create_return_request`, which is the nearest
  documented operation — Steadfast has no direct cancel.

**Sources.** The official doc could not be fetched first-party (steadfast.com.bd
403s automated fetches; the Scribd copy is paywalled). Used two independent
verbatim mirrors of the official Google Doc that agree line-for-line
([PKTonmoy/e-com2](https://github.com/PKTonmoy/e-com2),
[0xzahed/Zelvobd_backend](https://github.com/0xzahed/Zelvobd_backend)),
cross-checked against runnable official code: the steadfast-it Laravel package
(<https://github.com/steadfast-it/SteadFast-Courier-Laravel-Package>) and the
`steadfast-api` WordPress plugin (author URI steadfast.com.bd).

**Not verified:** rate limits; whether a duplicate `invoice` is idempotent or an
error; whether 422 is ever used alongside 400.

## RedX

- Sandbox `https://sandbox.redx.com.bd/v1.0.0-beta`, production
  `https://openapi.redx.com.bd/v1.0.0-beta`.
- Auth header is `API-ACCESS-TOKEN: Bearer <jwt>` — note the custom header
  name, not `Authorization`. The JWT is issued from the merchant panel; there is
  **no token endpoint** on the OpenAPI host, so nothing to refresh.
- `POST /parcel` → flat `{"tracking_id": "..."}`.
- **`parcel_weight` is in grams**, not kilograms. Two other official tables
  confirm this where the create-parcel table is ambiguous. Getting this wrong
  by 1000× is the kind of error that quietly overcharges every parcel.
- Status is read from `GET /parcel/info/{id}`, **not** `/parcel/track/{id}` —
  track returns only bilingual prose with no machine-readable status.
- Cancel is `PATCH /parcels` (plural) with an `update_details` envelope. There
  is no `/parcel/{id}/cancel`; the endpoint some third-party READMEs list under
  that name 404s.

**Sources.** RedX's docs are hand-maintained JS objects inside the merchant
panel SPA, and that bundle *is* the authoritative spec: the field tables and
cURL samples above are verbatim from
`https://redx.com.bd/_next/static/chunks/pages/developer-api-*.js`
(<https://redx.com.bd/developer-api/>). Route existence was confirmed by
unauthenticated probes (401 = real route, 404 = not a route). Cross-checked
against [codeboxrcodehub/redx-courier](https://github.com/codeboxrcodehub/redx-courier)
and the official `redx-for-woocommerce` plugin.

**Not verified:**

1. **The parcel status vocabulary is known-incomplete.** RedX publishes only the
   8-value webhook `MAPPED_STATUS` list, yet its own `/parcel/info` sample
   returns `pickup-pending`, which is not in that list. `STATUS_MAP` covers the
   8 plus `pickup-pending`; **assume there are more values we have not seen.**
2. **The authenticated validation-error shape.** Every probe without a token
   short-circuits at 401, so the 4xx body for a *valid* token with a bad payload
   is untested. Error classification falls back to HTTP status.
3. **`is_closed_box`** appears in RedX's cURL sample but not in its field table.
   Not sent.
4. `parcel_details_json` is typed "object" in the table but sent as an array of
   objects in the sample. We follow the sample.

## Testing

`apps/logistics/tests/test_couriers_*.py`. All HTTP is mocked at
`urllib.request.urlopen` via `apps/logistics/tests/helpers.py`; **no test
reaches a real courier.** No new HTTP-mocking dependency was added — the repo
already uses `unittest.mock`, and the gateways use stdlib `urllib`.
