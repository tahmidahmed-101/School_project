# Outgoing email

## What sends email

Only two flows, both in `apps/accounts/services/authentication.py`:

| Flow | Behaviour when the mail server fails |
| --- | --- |
| Email verification code | `503 email_unavailable`; the code just issued stays valid |
| Password reset code | Logged, then swallowed: the response is the same generic "If the email exists…" whether or not the address has an account |

Order updates are in-app notifications and Telegram staff alerts, not email.
Nothing on the checkout or order path sends mail.

They compose their own subject and text and hand it to
`apps.business.services.email.send_email`, which picks the server and sends.
"Accepted" there means the SMTP server took the message. SMTP cannot confirm it
reached an inbox.

## Which server sends

1. An SMTP server **saved from the dashboard**, while it is enabled, complete,
   and its password can be decrypted.
2. Otherwise the **environment**: `EMAIL_BACKEND` and the `EMAIL_*` settings,
   exactly as before. Without `EMAIL_BACKEND` that is the console backend,
   which only prints the email to the log.

A disabled saved server, or one whose password the server can no longer
decrypt, falls back to the environment rather than stopping email: email is
how customers recover their accounts. An enabled saved server that fails at
send time does **not** fall back; the send fails as described above.

Each send opens its own connection with explicit settings. The global Django
email settings are never changed at runtime.

## Dashboard API

Under `/api/v1/admin/settings/`. Admins hold every permission.

| Method | Path | Permission | Does |
| --- | --- | --- | --- |
| GET | `email/` | `settings.view` or `settings.manage` | Which server is in force, with safe details |
| PATCH | `email/` | `settings.manage` | Save or change the shop's own SMTP server |
| DELETE | `email/` | `settings.manage` | Forget it; the environment applies again |
| POST | `email/test/` | `settings.manage` | Send a marked test message; 5 per hour per user |

PATCH fields: `host`, `port` (25, 465, 587 or 2525), `security`
(`starttls`, `ssl` or `none`), `username`, `password` (write-only),
`from_name`, `from_email`, `is_enabled`.

- The first save must be complete: host, port, security and sender email,
  plus a password whenever there is a username. It starts enabled.
- Later saves change only what they send. Leave out `password` to keep it —
  except when changing `host` or `username`, which needs the password again
  (otherwise an editor could point the saved password at their own server).
- A login is only accepted over `starttls` or `ssl`.
- The host must be a dotted public name or a public IP address, and is checked
  again on every connection: names resolving to loopback, private, link-local
  or other internal addresses are refused (`host_not_allowed`). Combined with
  the port list, this stops the setting being used to probe the server's own
  network.
- Sender name and address are checked for line breaks (header injection).

GET never returns a password: `dashboard.password_status` is `set`,
`missing`, `unreadable` (saved, but no configured key decrypts it) or
`not_needed` (no login). For the environment it reports the backend, host,
port, security and whether credentials are set — never the password itself.

The test email goes to `recipient`, or to the requesting user's address. Its
response says `accepted: true/false` plus a fixed `reason` code —
`auth_failed`, `connection_failed`, `timeout`, `tls_failed`,
`recipient_refused`, `sender_refused`, `host_not_allowed` or `rejected` —
never the server's own reply, which can echo the login. The outcome of the
last test is kept on the saved server.

Saves, resets and tests are audit-logged with field names and outcomes only.

## Secrets

The saved password is encrypted with Fernet under `SECRETS_ENCRYPTION_KEYS`
(`apps/common/utils/secrets.py`), the same server-only key that protects the
conversion-tracking secrets. Without it a password cannot be saved
(`encryption_key_missing`); a relay without a login needs no key. Rotate it by
listing a new key first, then the old one, and saving the password again.

## Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `EMAIL_BACKEND` | console | `django.core.mail.backends.smtp.EmailBackend` to send for real |
| `EMAIL_HOST` / `EMAIL_PORT` | `localhost` / `25` | |
| `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` | empty | |
| `EMAIL_USE_TLS` / `EMAIL_USE_SSL` | `False` | STARTTLS / implicit TLS; set at most one |
| `EMAIL_TIMEOUT` | `10` | Seconds. Also applies to the saved server |
| `DEFAULT_FROM_EMAIL` | `noreply@example.com` | Sender when the environment sends |
| `SECRETS_ENCRYPTION_KEYS` | empty | Needed before a password can be saved from the dashboard |

The defaults are Django's own, apart from `EMAIL_TIMEOUT`, which Django leaves
unlimited: an installation that sets none of them behaves as before, except
that a stalled mail server can no longer hold a worker forever.
