# E-Commerce Admin Dashboard

Admin dashboard for the **kull-mart** backend (Django/DRF): sales, catalog, inventory,
purchasing, accounting, customers, marketing, risk and store settings.

Built with React 19, TypeScript, Vite, Redux Toolkit, React Router, shadcn/ui, Tailwind CSS 4
and Recharts.

## Getting started

1. Run the backend (`../../backend`):

   ```bash
   cd ../../backend
   python manage.py runserver 8000
   ```

   For a local admin login and demo data:

   ```bash
   python manage.py seed_chart_of_accounts
   python manage.py seed_demo --orders 120 --days 120 --customers 30
   python manage.py seed_data --admins 1   # seed-admin-1@example.com / SeedPass123!
   ```

2. Run the dashboard:

   ```bash
   cp .env.example .env    # VITE_BACKEND_ORIGIN defaults to http://127.0.0.1:8000
   npm install
   npm run dev             # http://localhost:5173
   ```

   The Vite dev server proxies `/api` to the backend, so the browser sees same-origin
   requests and the backend's HttpOnly refresh cookie works without CORS setup.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) and production build |
| `npm run lint` | ESLint |
| `npm run test:unit` | Unit tests in `tests/unit` (Node test runner) |
| `npx playwright test` | E2E tests (needs `E2E_EMAIL` / `E2E_PASSWORD`, see `.env.example`) |

## Architecture

- **Feature modules** — each domain lives in `src/features/<domain>/` and registers itself
  through two files:
  - `module.ts` — its routes (lazy-loaded) and sidebar sections, with the backend
    permission code each link needs;
  - `reducers.ts` — its Redux reducers.

  `src/app/modules.ts` and `src/app/store.ts` collect them; the router, sidebar and global
  search are generated from the registry, so adding a page never touches shared files.
- **API layer** — `src/lib/api/client.ts` (axios with token refresh and kull-mart error
  normalisation), `src/lib/api/envelope.ts` (response unwrapping),
  `src/lib/sliceFactory.ts` (CRUD slices with stale-response protection and per-request
  status).
- **Auth** — the access token is kept in memory only; the refresh token is an HttpOnly
  cookie set by the backend. Sessions are restored on reload via `/auth/refresh/`.
- **Permissions** — admins receive `["*"]`; staff receive StaffPermission codes
  (`orders.view`, `catalog.manage`, …). Navigation and actions are filtered with
  `hasPermission()`.
- **Formatting** — money, dates and enum labels go through `src/lib/format.ts` (currency
  follows the store's business profile; default BDT).

## Deployment

`npm run cf:deploy` builds with `VITE_API_BASE_URL` set to the production API and runs
`wrangler deploy`. `wrangler.jsonc` serves `dist/` as static assets with a single-page-app
fallback on the `admin.kullmart.com` custom domain. The dashboard's origin must be in the
backend's `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS`.
