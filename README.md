# Kull Mart

```
kull-mart/
  frontend/   Next.js storefront (port 3002)
  backend/    LaunchCart Django API (port 8000)
```

## Backend

Python 3.12+. From `backend/`:

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py migrate      # first run only
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Health check: <http://127.0.0.1:8000/health/> · API docs: <http://127.0.0.1:8000/api/docs/>.
Local settings need no `.env` and use `backend/db.sqlite3`.

If the bundled `.venv` does not work on your machine, recreate it:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -e ".[dev]"
```

### Telegram staff bot

Optional. Linked staff get new-order and high-risk alerts in their private chat with the bot, and can use
`/today`, `/pending`, `/order SO-XXXXXXXX` and the buttons under an alert (confirm, COD verified, cancel).

1. Create a bot with @BotFather and set `TELEGRAM_BOT_TOKEN` in `backend/.env`.
2. Each staff member opens **Profile → Telegram** in the dashboard, gets a code and sends the bot `/start CODE`.
3. Production: set `TELEGRAM_WEBHOOK_SECRET` to a long random string and register the webhook once:

   ```bash
   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -d "url=https://<api-host>/api/v1/webhooks/telegram/" -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
   ```

4. Local development (Telegram cannot reach localhost): run `manage.py telegram_poll` next to `runserver` instead.

## Frontend

Node 20+. From `frontend/`:

```powershell
cd frontend
npm install
npm run dev        # http://localhost:3002
npm run verify     # typecheck, lint, format check, unit tests, production build
npm test           # unit tests (Vitest)
npm run test:e2e   # Playwright (npx playwright install chromium once)
```

The storefront is organised as `app/` (routes), `modules/<feature>/`, `design-system/` and `lib/`; see
`frontend/AGENTS.md` for the layering rules.

The storefront reads the backend's public API through the `NEXT_PUBLIC_API_URL` variable
(see `frontend/.env.example`, default `http://127.0.0.1:8000/api/v1/public`). The browser talks to
`/api/public/*` on the storefront itself, which Next proxies to the backend.

Product photos are served from `frontend/public/catalog/` (the backend stores paths like `/catalog/x.jpg`).
