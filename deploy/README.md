# Deploy

| Part | Host | Where |
| --- | --- | --- |
| Storefront (`frontend/`) | `kullmart.com`, `www.kullmart.com` | Cloudflare Worker `kull-mart-web` (OpenNext) |
| Admin (`frontend/admin/`) | `admin.kullmart.com` | Cloudflare Worker `kull-mart-admin` (static SPA) |
| API (`backend/`) | `api.kullmart.com` | Edge VPS `169.58.218.225`, containers `kull-mart-{db,api}` behind `edge-caddy` |

The storefront build fetches the live API, so deploy in this order: API, then storefront, then admin.

## One-time

1. Registrar: point `kullmart.com` at the Cloudflare nameservers shown in the dashboard; wait for the zone to be **Active**.
2. Cloudflare DNS: `A api -> 169.58.218.225`, **DNS-only** (grey cloud). Caddy gets its certificate over HTTP-01.
3. Cloudflare: enable R2 in the dashboard (the free KV plan's 1,000 writes/day can't hold the page cache), then from `frontend/`:
   ```bash
   npx wrangler r2 bucket create kull-mart-web-cache
   npx wrangler d1 create kull-mart-web-tags   # put the database_id into wrangler.jsonc
   npx wrangler secret put REVALIDATE_SECRET   # 16+ chars
   ```
4. VPS: copy `deploy/api.env.example` to `/home/arif/website/kull-mart-api/.env` and fill it in.
5. After the first API deploy, fill in the business profile (phone, email, address) in the admin, and add
   `kull-mart-api` to `~/projects/edge/REGISTRY.md`. Retire the old `kull-mart-web` row (kullmart.nestmartit.com).

## Every deploy

```bash
deploy/deploy-api.sh                      # API
(cd frontend && npm run cf:deploy)        # storefront
(cd frontend/admin && npm run cf:deploy)  # admin
```

Wrangler needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment (or `npx wrangler login`).

The reservation sweeper is off; read `backend/scripts/reservation_sweeper.sh` before
`docker compose -f docker-compose.prod.yml --profile sweeper up -d`.
