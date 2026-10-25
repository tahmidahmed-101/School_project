# Newsletter email campaigns

Staff write a plain-text newsletter, send themselves a test copy, then
schedule it. A background run sends it in batches to every subscriber who may
receive it. The dashboard has Campaigns screens for it. A campaign can also be
an SMS: see `sms-and-recovery.md`.

## Lifecycle

```
draft ──schedule──▶ scheduled ──(sender run, once due)──▶ sending ──▶ sent
  ▲                    │                                   │
  └────unschedule──────┘           cancel (scheduled or sending) ──▶ cancelled
```

- Only a **draft** can be edited or deleted. Unschedule to edit again.
- **Schedule** checks first: an SMTP server is active (dashboard or
  environment, see `email.md`), unsubscribe links can be built
  (`PUBLIC_API_BASE_URL`), and at least one subscriber can receive it.
- When a scheduled campaign is due, the next sender run **fixes its
  recipients**: one `CampaignDelivery` row per eligible subscriber. People who
  subscribe later are not added.
- **Cancel** skips every copy not yet sent. A batch already handed to the mail
  server cannot be recalled.

## Who receives it

Subscribers who are active, have consent on record (`consented_at`), and are
not on the suppression list (compared case-insensitively). Each address gets
one copy per campaign.

- `consented_at` is set by a storefront sign-up or re-subscribe, or by staff
  adding or reactivating an address. Existing subscribers were backfilled from
  their sign-up date, since every one of them signed up through the storefront.
- A subscriber who unsubscribes or is suppressed after the campaign started is
  **skipped** when their copy comes up.

## Suppression list

`EmailSuppression` holds addresses no campaign may reach:

| Reason | Added by |
| --- | --- |
| `unsubscribed` | The unsubscribe link, or the storefront's unsubscribe form |
| `bounced` | The mail server refusing the address outright (`recipient_refused`) |
| `manual` | Staff, through the API |

Subscribing again lifts an `unsubscribed` entry (that is the owner opting back
in) but never a `bounced` or `manual` one. Staff can remove any entry.

**Account email ignores this list.** Password resets and verification codes
always go out; marketing preferences never block them.

## Unsubscribe

Every copy ends with a footer — why it arrived, the business name and postal
address (from the business profile), and the recipient's own unsubscribe link
— and carries `List-Unsubscribe` and `List-Unsubscribe-Post:
List-Unsubscribe=One-Click` headers, so mail clients can show their own
unsubscribe button.

The link is `PUBLIC_API_BASE_URL/api/v1/public/marketing/unsubscribe/<token>/`,
a small page served by the backend:

- **GET** shows a confirm button and changes nothing, so link scanners that
  open every link unsubscribe no one.
- **POST** unsubscribes — the button, and a mail client's one-click request
  (RFC 8058). It is idempotent.
- The page never shows the email address. A forged or broken token gets a 404.

The token is the subscriber's id signed with Django's `SECRET_KEY`. It does
not expire, so a link in an old email keeps working. Changing `SECRET_KEY`
breaks every link already sent unless the old key is kept in
`SECRET_KEY_FALLBACKS`.

To use a storefront page instead, set `NEWSLETTER_UNSUBSCRIBE_URL` with
`{token}` where the token goes; that page must POST to the URL above.

The storefront's existing `POST /public/marketing/unsubscribe/` (by email) still
works, now also suppresses the address, and answers the same whether or not
the address was subscribed.

## Sending

`manage.py send_campaigns` does one run: start campaigns now due, then send up
to `CAMPAIGN_BATCH_SIZE` copies (default 200) across all sending campaigns,
over one SMTP connection per campaign. The `sweeper` container runs it every
`RESERVATION_SWEEP_INTERVAL_SECONDS` (default 900 s), so a campaign scheduled
"now" starts within that interval, and 200 copies go out per run. Raise the
batch or shorten the interval to send faster, within your mail provider's
hourly limit. **Nothing sends unless the sweeper (or a cron running the
command) is running.**

- Each copy is claimed before it is sent (`SELECT … FOR UPDATE SKIP LOCKED`),
  so overlapping runs never send the same copy twice.
- A copy the server refuses outright is failed for good and its address
  suppressed. Connection failures, timeouts and other refusals are retried on
  later runs, up to 3 attempts per copy.
- A copy claimed by a run that died is picked up again after 15 minutes. If
  that run had already handed it to the server, the recipient can get a second
  copy: SMTP gives no way to ask whether a message was taken.
- A campaign is `sent` once no copy is left to try. `sent` on a copy means the
  SMTP server accepted it, not that it reached the inbox: bounces arriving
  later by email are not processed.
- Queries per run do not grow with the batch: copies, suppressions and
  subscriptions are read in one query each, outcomes written in one UPDATE per
  outcome.

## API

Under `/api/v1/admin/marketing/`. `marketing.view` reads; `marketing.manage`
does everything else. Admins hold both.

| Method | Path | Does |
| --- | --- | --- |
| GET / POST | `campaigns/` | List (filter `status`, search) / create a draft (`name`, `subject`, `body`) |
| GET | `campaigns/audience/` | Active subscribers, eligible recipients, suppressed addresses |
| GET / PATCH / DELETE | `campaigns/<id>/` | Detail with `delivery_counts`; edit or delete a draft |
| POST | `campaigns/<id>/schedule/` | Queue it; optional `send_at` |
| POST | `campaigns/<id>/unschedule/` | Back to draft |
| POST | `campaigns/<id>/cancel/` | Stop it |
| POST | `campaigns/<id>/test/` | One `[Test]` copy to you or `recipient`; 5 per hour |
| GET | `campaigns/<id>/deliveries/` | Each recipient's copy (filter `status`) |
| GET / POST | `suppressions/` | List (filter `reason`) / block an address (`email`, `note`) |
| DELETE | `suppressions/<id>/` | Lift a block |

Every action is written to the audit log.

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `PUBLIC_API_BASE_URL` | empty | Required to schedule, e.g. `https://api.example.com` |
| `NEWSLETTER_UNSUBSCRIBE_URL` | empty | Optional storefront unsubscribe page, with `{token}` |
| `CAMPAIGN_BATCH_SIZE` | `200` | Copies per sender run |

## Not included

Double opt-in (a confirmation email before a sign-up counts), HTML email,
segments, open/click tracking, and processing bounce or complaint reports from
the mail provider.
