# Tracking lib (GA4, GTM, Meta pixel and CAPI)

Copy `tracking-browser.ts` into the web app, and `tracking-server.ts` with `bdPhone.ts`, `env.ts`, `money.ts` into the API
(imports use `.ts` extensions: `allowImportingTsExtensions` with `noEmit`). No package, no dependency.

## Wiring
- Browser, once at startup: `bootstrapTracking({ ga4Id, metaPixelId, consent, isConversion })`, then `loadOnFirstInteraction()`.
  GTM is `{ gtmId }` alone (mixing it with direct tags throws); its Meta tag must take Event ID from the `event_id` dataLayer variable.
- `track("ViewContent", { value, items }, eventId)`: commerce events need `items`, Purchase also `value` and `transaction_id`.
  `trackPageView()` on route changes (direct tags only; GTM triggers count its own).
- `consent: false` loads no tag script and stores no UTM, fbclid or ids until `setConsent(true)`, which loads them.
  `collectContext()` then returns only `{ consent, utm: {}, sourceUrl }`. Post it with the order; the server sends nothing without consent.
- The API saves the context on the order, makes the id with `derivedEventId("purchase", orderId)`, returns it, and the browser passes it to `track`.
- After the order is stored: `reportConversion({ name: "Purchase", eventId, recordId, value: "1250.00", lines, sourceUrl, buyer }, { log, ...trackingEnv(process.env), isConversion })`.
  Needs lines, value, the buyer's real IP and user agent, and `sourceUrl`. Server events: Purchase and the COD follow-ups only.
- Status changes: `lifecycleInput("delivered" | "cancelled" | "returned", ...)` then `reportConversion` (Meta takes 7 days, GA4 72 hours).
- `isConversion` drops staff, test and demo orders (server reads `input.facts`; the browser's one covers staff sessions).

## Table the app adds (the unique index is the dedup)
```sql
CREATE TABLE tracking_send (record_id text NOT NULL, provider text NOT NULL, event_name text NOT NULL, status text NOT NULL,
  reason text, http_status int, attempts int NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_id, provider, event_name));
```
`SendLog.claim` = INSERT as `pending` ... ON CONFLICT DO UPDATE SET status = 'pending', updated_at = now() WHERE status IN ('failed','skipped')
OR (status = 'pending' AND updated_at < now() - interval '10 minutes') RETURNING; a returned row means true. `finish` writes the result.
Store on the order: the five UTM values, fbp, fbc, ga client id, IP, user agent, consent.

## Env (blank = absent via `envOptional`; the app boots without them; add each to `.env.example`)
`NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GTM_ID`; server `META_PIXEL_ID`, `META_CAPI_TOKEN`, `GA4_MEASUREMENT_ID`,
`GA4_API_SECRET`. `test_event_code` is never read from env: pass `testEventCode` for a test run.

## CSP (match `rules/website.md` track.csp; only the tags in use)
- GA4/GTM: script-src `www.googletagmanager.com`; connect-src `*.google-analytics.com *.analytics.google.com www.googletagmanager.com`.
- Meta: script-src `connect.facebook.net`; connect-src and img-src `www.facebook.com`. Server calls need no CSP entry.

## Limits
- The Meta pixel reads `location.href` itself: never put a phone, token or reference in the URL of a page that fires events
  (the lib masks only GA4 `page_location`). Run `pmo site check <repo>` after wiring; feed `id` must equal `content_ids`.
