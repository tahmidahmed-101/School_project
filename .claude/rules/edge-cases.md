---
scope: client-repos
enforce: prose
added: 2026-10-16
source: "2,040 fix commits in 37 repos since 2026-08-01, 616 of them these classes (pmo/docs/audit/2026-10-16/D4-recurring-bugs.md)."
paths:
  - "**/*.{ts,tsx,js,jsx,vue,py,html,css}"
---
# Edge cases (client repos) — check every line your change touches before calling it done
## UI
- At 360px: no horizontal page scroll; header, tables, dialogs and action columns fit (tables become cards or one action menu).
- Long values: a 40-char Bangla name, a 12-digit amount and an empty name do not overflow, clip or overlap.
- Every screen shows loading, empty (pointing to where the first record is made), error (the server's reason) and no-permission states; never turn an API failure into an empty list or a zero; open every touched screen on an empty database.
- Check light and dark: text, icons and borders come from tokens, never raw colours; contrast passes in both.
- A role without permission sees no button, link or page it cannot use; no button that does nothing.
- After save: the form keeps its values on error, and every list, card and public page showing the record refreshes.
- No heading, action, tile or explainer text that the page shell or a sibling already shows.
- Classes: no duplicate or conflicting utilities, no palette class or raw colour where tokens exist, no off-scale arbitrary size, no class list pasted into 3+ files (`pmo ui check --changed`). A fix on one page goes to every sibling page.
- Sticky or auto-hide headers keep the page height; the theme is set before first paint.
- Touch: targets at least 24px (primary actions 44px) at 360; inputs at least 16px on phones; zoom never blocked; layouts with a fixed footer use dvh, and fixed bottom bars respect the safe area.
- Keyboard: every control shows a focus-visible ring (no bare outline-none), sticky bars never cover the focused element, icon-only controls have an aria-label, and hover-only actions also show on focus and touch.
- Meaning never by colour alone: status and money in/out also carry a word, sign or icon. Non-text contrast (input borders, icons, checkbox outlines) is at least 3:1 in both themes. Dark mode sets color-scheme so selects, date pickers and scrollbars follow.
- Forms: a visible label, not placeholder only; phone, email, amount and OTP inputs set type, inputmode and autocomplete; no paste blocking; a submit with errors focuses the first invalid field, linked by aria-describedby.
- Dialogs: focus moves in and stays, Esc closes, focus returns to the trigger, the page behind does not scroll, and footer buttons stay visible at 360.
- Delete confirms or offers undo; one primary button per view; every save shows success or the failure reason (role=status or alert), and errors do not auto-dismiss.
- One icon library at consistent sizes; animation respects prefers-reduced-motion and autoplay carousels have a pause.
- An unknown slug or id shows the 404 page with status 404; bad input answers 400, never 500.
## Data and forms
- The server validates what the client validates; the field error shows under the field and no hint hides it.
- Trim text inputs (never passwords); a blank optional field saves as absent, not "".
- Phone: copy `~/projects/brain/scaffold/lib/bdPhone.ts` / `bd_phone.py` — accepts 01…, 8801…, +880 1…, Bangla digits; stores +8801…; login takes any spelling.
- Dates use Asia/Dhaka (`~/projects/brain/scaffold/lib/dhakaDate.ts` / `dhaka_date.py`, or Django timezone.localdate()), never naive date.today()/now() or toISOString().slice(0,10); date ranges include their last day; test 00:30 and 23:30 Dhaka.
- Submit is disabled while pending; the server refuses a duplicate (unique key or row lock), not the client.
- Every status change goes through one transition check: try it twice, on a cancelled record, and out of order.
- Filters and search run on the server; the page resets on filter change; the last and empty pages work; page size has a max.
- A figure shown in two places (tile, report, export, PDF) comes from one function.
## Money
- All arithmetic goes through the project money module (rules/money.md); no JS number or float on amounts. Display with `formatBdt` / `group_lakh` from the same module.
- Name the unit (amountPaisa, amountTaka); never pass taka where paisa is expected.
- Money and quantity columns are right-aligned with tabular-nums.
- Show ৳ with lakh grouping through the shared formatter; currency is BDT in UI, JSON-LD, feeds and PDFs.
## Bangla
- Every en key exists in bn; no English leaks on bn pages, errors, emails, SMS or PDFs.
- Dates and numbers format in the active locale.
- Bangla text gets line-height of at least 1.4 (no leading-none or leading-tight), and no letter-spacing or uppercase.
- PDFs and generated images embed a Bangla font: check ৳ and a conjunct like ক্ষ in the output.
- Bangla wording goes through bangla-copy; never ship translated register.
## Payments and tracking
- Confirm payment server to server (SSLCommerz val_id, bKash execute, Nagad verify); amount and currency must match.
- The IPN is idempotent: SUCCESS is terminal, a late FAILED never undoes it, a late success after a failure is accepted.
- Send the buyer's real name, phone, IP and address to the gateway; never placeholders like N/A or 127.0.0.1.
- One purchase event per order, one event_id for pixel and CAPI; staff and test orders are not conversions; the CSP allows the tags.
## Deploy
- A new env var goes in .env.example, a blank value counts as absent (`~/projects/brain/scaffold/lib/env.ts` / `env.py`), and the app boots without optional ones.
- Uploads live on a persistent volume and load on the public site (origin and CSP img-src checked).
- After merging, each app has one migration leaf; seeds never write demo data in production.
- After deploy, canary the changed pages on the real domain, including an upload or checkout if they were touched.
- Public site: `pmo site check <repo>` shows no new fails; its check ids and the Next.js wiring are in `~/projects/brain/rules/website.md`.
