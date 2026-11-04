---
scope: public-site
enforce: test:pmo/test/site.test.js
added: 2026-10-18
source: "git 9141d9a (2026-10-18): website baseline with pmo site check ids, shared Next.js seo.ts"
paths:
  - "**/next.config.*"
  - "**/robots.*"
  - "**/sitemap.*"
  - "app/**"
  - "src/app/**"
  - "pages/**"
  - "src/pages/**"
  - "**/templates/**"
  - "public/**"
---
# Website baseline (every public site; reviewed 2026-10-27)

Every line is a check id in `pmo site check`. A failing id is the work item; fix it, don't argue with it.
Client repos: a failing id is a baseline defect, not a change request. Log `brain item add <ID> bug "<check id>: …"`
and fix it (owner, 2026-10-18).

## Run it
- Live: `pmo site check <repo|url>`. Dev server: `pmo site check http://localhost:<port from pmo ports> --canonical-host <real domain>`.
- Nightly: `pmo site all` and `pmo site news` write to `out/site/`, shown on the web Today page. `site all` checks every
  `clients.json` live URL plus the apex of every domain the edge box serves (`out/edge.json`); a site on another box needs its live URL in `clients.json`.

## Checks
- `http.up` `http.https` `http.one-host`: home answers 200 on https; www and the apex are one host (the other one 301s to it, matching canonical).
- `http.cert`: the certificate is valid and has 14 days or more left.
- `http.404`: an unknown URL, and an unknown slug under each dynamic route, answer 404, not 200 (soft 404).
- `page.status`: every sitemap URL answers 200 with no redirect. No deleted or demo records in the sitemap.
- `robots.present` `robots.sitemap-ref` `robots.allows`: robots.txt names the sitemap. The live site doesn't block `*`; staging blocks everything.
- `sitemap.present` `sitemap.host` `sitemap.complete`: generated from data, covers every indexable page (each product, post, notice), real-domain URLs only. `lastmod` only when it's a real content date.
- `seo.title` `seo.title-unique`: present and unique. `seo.description` `seo.description-unique`: present, unique, ≥50 chars.
  Aim for title ≤60 and description ≤160 when writing new copy. Google truncates longer ones and doesn't penalise them, so don't rewrite approved copy just for length.
- `seo.h1`: exactly one. `seo.lang`: `<html lang>` matches the page language.
- `seo.viewport`: `width=device-width`. `a11y.img-alt`: every `<img>` has alt (`alt=""` for decoration). `links.broken`: no internal link answers 4xx/5xx.
- `seo.canonical`: absolute, self-referencing, on the real domain. `seo.indexable`: nothing in the sitemap is noindex.
- `hreflang.present` `hreflang.self` `hreflang.reciprocal`: bn/en sites: every page lists all variants (itself included) plus `x-default`, and each variant links back.
- `og.tags` `og.twitter` `og.image`: og:title, description, url and image on every page; image absolute, 1200×630, loads; `twitter:card` = `summary_large_image`.
- `icon.favicon` `icon.branded` `icon.apple` `icon.manifest` `meta.theme-color`: favicon (ico or svg) that is the client's own mark, never the create-next-app default; 180px apple-touch-icon, manifest with 192 and 512 icons, theme-color.
- `jsonld.valid` `jsonld.currency`: JSON-LD parses and has @type. Organization/LocalBusiness on home, BreadcrumbList on inner pages, Product+Offer (BDT) and Article where they apply.
  Don't add HowTo, sitelinks SearchBox, or the seven types Google removed in June 2025 (Book, Course Info, ClaimReview, Estimated Salary, Learning Video, Special Announcement, Vehicle Listing).
  FAQPage only for real Q&A: it no longer gets rich results for normal sites.
- `sec.csp` `sec.hsts` `sec.nosniff` `sec.referrer` `sec.frame` `sec.mixed`: CSP with frame-ancestors, HSTS, nosniff, Referrer-Policy; nothing loads over http.
- `lh.performance` `lh.accessibility` `lh.best-practices` `lh.seo` ≥ 90, mobile, one URL per route template (PageSpeed API).
- `cwv.lcp` ≤ 2.5 s and `cwv.cls` ≤ 0.1 in the lab; `cwv.field-lcp` / `cwv.field-inp` ≤ 200 ms / `cwv.field-cls` are real-user p75 (CrUX) once the site has traffic. INP replaced FID in March 2024.
- `og.image-size`: og:image at least 1200 px wide at 1.91:1 (1200×630), read from the image bytes.
- `og.image-unique`: each product, post, notice and tour page has its own og:image, never the home image or one shared with another detail page. About, contact and legal pages may reuse the site image.
- `jsonld.types`: home has Organization/LocalBusiness (or a subtype) with absolute `url` and `logo`; every inner page has BreadcrumbList; a product page has Product with an Offer carrying price and priceCurrency.
- `brand.logo`: the logo shows and loads in the header or nav on home and about; the JSON-LD logo URL loads.
- `seo.title-length` ≤ 60 and `seo.description-length` ≤ 160 graphemes, for new copy (see the note above on approved copy).
- `track.consistent`: every page carries the same GA4, GTM, Meta pixel and TikTok ids; no page has two GA4 or two pixel ids.
- `track.csp`: the CSP allows each tag present: GA4/GTM script-src www.googletagmanager.com, connect-src *.google-analytics.com *.analytics.google.com www.googletagmanager.com; Meta script-src connect.facebook.net, connect-src/img-src www.facebook.com; TikTok analytics.tiktok.com.
- `http.compression`: home HTML served br, gzip or zstd. `http.cache-static`: hashed JS/CSS has max-age ≥ 31536000 or immutable.

## Fixing LCP (the fail reason names the element and the top savings)
- Hero image: `next/image` with `priority` and real `sizes`; AVIF/WebP; nothing lazy above the fold.
- Fonts: `next/font` (self-hosted, swap); no Google Fonts `<link>` CSS. Third-party tags (GTM, Pixel) load `afterInteractive` or later.
- Reserve space for images, embeds and banners (CLS). Server-render the first screen; no client-only fetch for above-the-fold content.

## Next.js wiring (24 of 28 sites): copy `brain/scaffold/lib/seo.ts`
- `site.ts`: `export const SITE: Site = { name, url: envOptional("NEXT_PUBLIC_SITE_URL") ?? "<real domain>", locales, ogImage }`.
- Every `page.tsx`: `generateMetadata` returns `pageMetadata(SITE, { path, title, description, locale })`. No page without it.
- `app/robots.ts` → `robotsFor(SITE, <is live>)`; `app/sitemap.ts` → `sitemapEntries(SITE, [...static, ...rows from the DB/CMS])`.
- `app/icon.svg`, `app/apple-icon.png` (180), `app/manifest.ts` (192/512, theme_color), `app/opengraph-image.tsx` or `public/og.png`.
- `app/not-found.tsx`. Dynamic routes call `notFound()` for an unknown slug; never render an empty page with 200.
- JSON-LD: `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(productLd(SITE, …)) }} />`.
- `next.config`: `headers: [{ source: "/:path*", headers: securityHeaders({ img: [...], connect: [...], frame: [...], form: ["mailto:"] }) }]`. List every origin the site loads, sends to, frames or posts to; a missing one breaks the live page.
- Other stacks (Astro, Django, static) meet the same check ids by their own means.

## AI crawlers and llms.txt
- robots allows GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot and Google-Extended (nestmartit's choice). Google-Extended only controls Gemini training;
  blocking it doesn't remove a site from AI Overviews. A client can ask to block; record that in their items.
- llms.txt: optional; Google doesn't use it. Don't add unless asked.

## Why the checker can be trusted, and where it can't
- `pmo/test/site.test.js`: a fixture site with one planted defect per id must fail exactly those ids; a clean one must pass.
  Every false positive found gets a test that fails on the old code (alias canonicals, 404 www twin, relative Sitemap:, Cloudflare /cdn-cgi/ links, staging robots, og:image on the real host).
- Real sites: nextjs.org and web.dev; every fail they show was confirmed with curl. `seo.ts` gives 0 fails in trending-shop's prod build.
- Limits: regex HTML parse of server HTML (client-only content is invisible, as it is to many crawlers); 200 pages and 100 links
  sampled; no `PSI_API_KEY` = no `lh.*`/`cwv.*`. A local build shows only app headers and env fallbacks; the live run is the truth.

## When the rules change
`pmo site news` lists new Google Search Central, Search Status and Bing Webmaster posts each night.
If a post changes a rule here, edit this file and bump `reviewed`, then change `pmo/src/site.js` and its test. Every site picks it up at the next nightly.
