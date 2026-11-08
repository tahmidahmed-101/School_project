<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# School Project storefront

Next.js 16 (App Router) + React 19 + Tailwind 4 storefront for the LaunchCart Django API in `../backend`. There is no
database or server state here: the catalogue, checkout and order tracking all go through the public API, and
customer accounts (login, product questions, price reports) through the customer API.

## Verify before you say "done"

```bash
npm run verify   # typecheck -> lint -> format:check -> unit tests -> production build
```

Faster loops: `npm run typecheck`, `npm run lint`, `npm test`, `npm run format` (Prettier, writes). The build talks to the
live API, so start the backend first (see the root README). E2E: `npx playwright install chromium` once, then
`npm run test:e2e` (journeys that need products only run with `E2E_BACKEND=1`).

## Where code goes

```text
app/             routes ONLY: page/layout/route handlers, metadata, error/loading/not-found, CSS, fonts, icons.
                 Keep pages thin: fetch on the server, render a module component. No business logic here.
modules/<name>/  one folder per feature (catalog, cart, wishlist, checkout, tracking, marketing, auth, policies, seo,
                 shell, storefront, business). Inside: ui/, domain/ (pure rules), data/ (API access),
                 context.tsx, __tests__/.
design-system/   feature-agnostic UI: ui/ (Drawer, Modal, FormField...), patterns/, icons/.
lib/             shared kernel: types.ts, i18n, format, env, cache, api/client, variants/product helpers, hooks.
e2e/             Playwright specs.   tests/  shared unit-test fixtures.   docs/  the API OpenAPI file.
```

**Dependency direction is one-way: `app -> modules -> design-system -> lib`.** ESLint enforces it
(`eslint.config.mjs`): lib/ cannot import modules/ or design-system/, modules cannot import app/.

**Modules talk through public APIs.** Import another module via `@/modules/<name>` (client-safe barrel, `index.ts`) or
`@/modules/<name>/server` (server-only data, `server.ts`), never `@/modules/<name>/ui/...`. A new cross-module import
means adding the export to that module's `index.ts`. If two modules would import each other, move the shared piece
down (design-system or lib) rather than adding the cycle.

## Rules that must not be broken

- **Prices never come from the client.** `modules/checkout/domain/checkout.ts` sends `variant_id` + `quantity` only;
  the backend prices the order. Cart totals in the UI are estimates.
- **Server data access is `server-only`.** `modules/*/data/catalog.ts` and `brand.ts` start with `import "server-only"`
  and are reachable only through a module's `server.ts`. Client components get data from context
  (`useCatalog`, `useBrand`, `useProducts`) or from props.
- **Do not put the catalogue in the root layout.** The layout provides categories + brand only. Pages that list products
  wrap their content in `ProductsProvider`; header search lazily loads `/api/search-index`.
- **Env vars go through `lib/env.ts`** (`publicEnv`, validated, `NEXT_PUBLIC_*` only) or `lib/env.server.ts`
  (`serverEnv`, secrets). Never read `process.env` elsewhere, never put a secret in a `NEXT_PUBLIC_` variable.
- **Caching is centralised in `lib/cache.ts`** (`CACHE_TAGS`, `CACHE_LIFE`). Route-segment `revalidate` exports must be
  literals, so they carry a comment naming their `CACHE_LIFE` entry. Pages are dynamic; on the Worker,
  `lib/api/edge-cache.ts` keeps each cacheable API answer for its `CACHE_LIFE`. `POST /api/revalidate` cannot purge
  that, so a backend change shows on the storefront when the lifetime ends (60 s for the catalogue).
- **Colours:** new UI uses semantic utilities (`bg-surface`, `text-fg-muted`, `bg-action`, `bg-accent`, `border-line`)
  defined in `app/theme.css` + `app/globals.css`, not raw hex and not new primitive steps. Existing components still use
  the primitives (`brand-*`, `gold-*`, `ink-*`) and move over as they are touched.
- **Customer accounts live in `modules/auth`.** The browser calls `/api/v1/customer/*` (proxied in `next.config.mjs`
  under the backend's own path, because the HttpOnly refresh cookie is scoped to `Path=/api/v1/customer/auth/`). The
  access token is kept in memory only; send customer requests with `useAuth().authRequest`, never store a token.
  Customer requests carry `X-Auth-Client: storefront` (set in `lib/api/client.ts`): the backend keeps a separate
  refresh cookie for the dashboard, so the two apps never share or replace each other's session.
- **Tracking route gotcha (`modules/tracking/data/mutations.ts`):** the real route is `/tracking/orders/track/`; `docs/Public API.yaml` lists
  `/tracking/track/`, which 404s. Do not "fix" the code to match the YAML.
- Copy is bilingual (`T = { en, bn }`, dictionary in `lib/i18n.tsx`); add both languages for any new UI string.

## Tests

Vitest for pure logic and adapters (`**/__tests__/*.test.ts`, run with `npm test`), Playwright for journeys. New domain
rules, adapters and JSON-LD/metadata builders get a unit test next to them; anything touching checkout gets an e2e or
unit test.
