# SMS campaigns and abandoned-cart reminders

Both reuse existing machinery: SMS campaigns are `EmailCampaign` rows with
`channel="sms"`, and the cart reminder runs in the same sweeper loop as the
campaign sender (`scripts/reservation_sweeper.sh`, every 15 minutes). No new
service.

## SMS campaigns

Same lifecycle as email (`email-campaigns.md`): draft, scheduled, sending,
sent or cancelled. One delivery row per recipient with attempts and a failure
reason. `manage.py send_campaigns` sends both channels.

- **Audience**: only `SmsSubscriber` rows with `is_active=True`, keyed by the
  `+8801XXXXXXXXX` form. No opt-in means never sent. Consent is stored with
  `consented_at`.
- **Opt-in** (never pre-ticked): the checkbox at storefront checkout
  (`sms_marketing_opt_in`, grants only, never revokes) and the toggle on the
  account page (`GET/PATCH /api/v1/customer/profile/sms-marketing/`).
- **Opt-out**: every text ends with `Opt out: <link>`, built from
  `PUBLIC_API_BASE_URL` and a signed token
  (`/api/v1/public/marketing/sms-unsubscribe/<token>/`). The page confirms, a
  POST unsubscribes. The next run skips the number.
- **Limits**: body up to 640 characters. `SMS_CAMPAIGN_BATCH_SIZE` (default 100)
  texts per run, counted apart from the email batch. The admin form shows the
  segment count with the opt-out footer reserved (`sms_footer_length` in the
  audience payload).
- **Failure reasons** (`CampaignDelivery.failure_reason`): `not_configured`,
  `no_recipient`, `recipient_refused` (permanent, no retry), `provider_error`,
  `network_error`. Temporary failures retry up to 3 attempts. `send_sms`
  (OTP) keeps its boolean result; `deliver_sms` raises `SmsDeliveryError` with
  the reason.
- **Provider**: Twilio only (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_PHONE_NUMBER`). Scheduling is refused with `sms_not_configured` or
  `unsubscribe_url_missing` until those are set.

TODO(ask): whether Twilio can send to Bangladesh numbers from the configured
number or needs an approved alphanumeric sender id, and the per-text price.

## Abandoned-cart reminder

`manage.py send_cart_recovery`, run by the sweeper. It does nothing while
`BusinessProfile.cart_recovery_enabled` is off (default), set from the
Campaigns page in the dashboard (`settings.manage`).

A cart is reminded when it is a PENDING `SalesOrder` that:

- has lines and a contact phone that parses as a Bangladeshi mobile,
- was last touched at least `CART_RECOVERY_IDLE_HOURS` (2) and at most
  `CART_RECOVERY_MAX_AGE_HOURS` (48) ago,
- is not deleted and was not created by staff,
- belongs to a shopper with no order since the cart was opened (matched by any
  phone spelling or by customer),
- has no reminder yet. `recovery_sent_at` is set before the send, so a cart is
  never texted twice. A temporary provider failure releases it and stops the
  run; a refused number keeps it.

Other rules: at most `CART_RECOVERY_DAILY_CAP` (50) reminders per Dhaka day,
one reminder per phone inside the age window, numbers that opted out of SMS
are skipped. The text links to `STOREFRONT_BASE_URL/checkout`. The run says why
it did nothing: `switched_off`, `storefront_url_missing`, `sms_not_configured`.

The reminder is treated as a service message about the shopper's own cart: it
does not need marketing opt-in and carries no opt-out link, but a number that
opted out of SMS is still skipped.

TODO(ask): confirm that reading, or require opt-in and add the opt-out link.
TODO(ask): production values of `STOREFRONT_BASE_URL` and `PUBLIC_API_BASE_URL`.
TODO(ask): owner review of the Bangla reminder wording and the storefront
strings; the opt-out page is English only.
