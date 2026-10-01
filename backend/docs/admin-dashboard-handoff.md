# Admin Dashboard → Backend Handoff

Backend work found while wiring the admin dashboard (`frontend/admin`, a Vite + React app that
talks to `/api/v1/admin/...` through a dev proxy to `127.0.0.1:8000`). Written 2026-10-01 after the
dashboard was tested against the local backend with a seeded admin (`seed_data --admins 1`).

No backend code was changed during that work — the frontend worked around items 2 and 3 where it
could. Each item says what the frontend does today, so you know what to update once it's fixed.

| # | Priority | Item | Frontend impact today |
|---|----------|------|-----------------------|
| 1 | **High** | Admin brand list returns 405 | Brands page can't load |
| 2 | Medium | No CSV export endpoint for expenses / vendor payments | Frontend pages through the list API, capped at 5,000 rows |
| 3 | Low | Subscribers export ignores `is_active` | Export can include rows the list filters out |
| 4 | Deploy | Production origin / CORS for the admin app | Admin's `vercel.json` points at an old backend |
| 5 | Info | Demo seeder uses external placeholder images | Storefront allow-lists `picsum.photos` |

---

## 1. `GET /api/v1/admin/catalog/brands/` returns 405 — **fix first**

**Symptom.** The dashboard's Brands page shows "Couldn't load … Method "GET" not allowed." Creating,
editing, restoring and bulk-status still work (they use other methods/URLs); only listing fails.
Any other client listing brands this way gets the same 405.

**Cause.** `api/v1/admin/catalog/brand_views.py` — `AdminBrandListCreateView` defines
`get_queryset()` and `post()` but no `get()`, so DRF has no GET handler. The sibling
`AdminCategoryListCreateView` (`category_views.py`) has the missing piece:

```python
def get(self, request) -> Response:
    return self.list_response(request)
```

**Fix.** Add that `get()` to `AdminBrandListCreateView`.

**Test (missing today).** Nothing exercises the brand list endpoint — that's how it slipped
through. Add API tests for `GET admin/catalog/brands/` covering: 200 with the paginated envelope,
`search` on name, `category_id` and `is_active` filters, `include_deleted` (needs
`catalog.manage`), and 403 without catalog permission.

**Frontend:** nothing to change — it already calls `GET /admin/catalog/brands/?page=&page_size=`.

---

## 2. CSV export endpoints for expenses and vendor payments

**Today.** Orders, audit logs, subscribers, variants and the stock ledger have server-side
`…/export/` views. Expenses and vendor payments don't (`/admin/accounting/expenses/export/` and
`/admin/procurement/vendor-payments/export/` both 404). Their "Export CSV" buttons originally
exported only the 20 rows on screen.

**Frontend workaround (in place).** `frontend/admin/src/features/finance/components/Expenses.tsx`
and `.../procurement/components/VendorPayments.tsx` fetch every page of the list endpoint with the
active filters (`fetchAllPages`, 100 rows/request, max 50 pages = **5,000 rows**) and build the CSV in
the browser. Correct up to that cap, but slow for large ranges and silently truncated past it.

**Ask.** Add export views following the existing pattern (`AdminNewsletterSubscriberExportView` in
`api/v1/admin/marketing/views.py`: `CsvRenderer`, `csv_response(filename, EXPORT_COLUMNS, rows)`),
accepting **the same filters as the list views** so "export what I'm looking at" holds:

- `GET /api/v1/admin/accounting/expenses/export/` — `search` (payee, description,
  reference_number), `start`, `end`, `category_id`, `account_id`, `include_deleted` (needs
  `accounting.post`, as on the list), `ordering` (`expense_date`, `amount`). Same permission as the
  list (`AdminExpenseListCreateView`).
- `GET /api/v1/admin/procurement/vendor-payments/export/` — `method`, `start`, `end`,
  `ordering` (`paid_at`, `amount`). Same permission as the list.

Columns: whatever the list serializers expose that's useful in a spreadsheet; the column mapping in
each page's `onExport` handler (the two files above) is a reasonable starting point.

**Frontend follow-up once shipped.** Replace the `fetchAllPages(...)` export in both pages with
`downloadFile("<endpoint>/export/", "<name>.csv", list.query)` from `@/lib/download`, as Orders does.

---

## 3. Subscribers export ignores `is_active`

`AdminNewsletterSubscriberExportView.get` applies `filter_search` and ordering but not the
`is_active` filter that the list view (`get_bool(self.request.query_params, "is_active")`) honours.
The dashboard sends the list's filters to the export, so an export taken while filtering to
active/inactive subscribers includes everyone.

**Fix.** Pass `is_active=get_bool(request.query_params, "is_active", default=None)` into
`subscribers_list(...)` in the export view, mirroring the list. No frontend change needed.

---

## 4. Deployment: serving the admin app against this backend

Not code bugs — configuration to sort out before the admin goes live:

- `frontend/admin/vercel.json` rewrites `/api/*` to `https://yoyo-ecom-production-88e8.up.railway.app`
  — the backend the dashboard used before it moved into this repo. Point it at this backend's
  production URL.
- The dashboard relies on the HttpOnly refresh cookie (path `/api/v1/customer/auth/`, `SameSite=Lax`).
  The Vercel rewrite keeps requests same-origin, which is what makes that cookie work. If the admin is
  instead served from a different origin than the API, add that origin to `CORS_ALLOWED_ORIGINS` and
  `CSRF_TRUSTED_ORIGINS` in production settings, and revisit `REFRESH_COOKIE_SAMESITE`.

---

## 5. (Info) Demo seeder images

`apps/common/services/demo_seed/seeder.py` gives seeded products `https://picsum.photos/seed/...`
URLs (asserted by `apps/common/tests/test_demo_seed_images.py`). The storefront's `next/image` rejects
unlisted hosts and the home page crashed, so `frontend/next.config.mjs` now allow-lists
`picsum.photos/seed/**`. No backend change required; just be aware that demo data depends on an
external image host (offline demos will show broken images). If you'd rather keep demo images local,
the seeder could write files under `media/` instead — then the storefront allow-list entry can go.

---

## How this was verified

- Backend running locally (`python manage.py runserver 8000`), dashboard on `localhost:5180`.
- Every admin endpoint the dashboard calls was hit with the seeded admin's token: all return 200
  except the brand list (405), the two missing exports (404), and POST-only routes (405 on GET).
- Read-only checks only — no create/update/delete requests were sent.
