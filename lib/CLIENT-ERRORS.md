# Client errors (browser to server log)

Copy `client-error.ts` into the web app, and `client-error-route.ts` to `app/api/client-error/route.ts` (Next) or
`client_error.py` into the Django project. No package, no dependency, no new service.

## Wiring
- Once on the client at startup (a `"use client"` component in the root layout): `installClientErrorListeners()`.
- In `error.tsx` and `global-error.tsx`: `useEffect(() => reportClientError(error, "error-boundary"), [error])`.
- Money paths (checkout, payment return, login, OTP): the page path or `where` carries the word, so `pmo logs` files after 3
  occurrences instead of 20. Name the `where` after the step, for example `reportClientError(e, "checkout-submit")`.
- Prove it once per app: `curl -i -X POST -H 'content-type: application/json' -d '{"message":"probe","path":"/","where":"curl"}' https://<site>/api/client-error`
  must answer 204, and `docker logs <web>` must show one `[client-error]` line. No line means the proxy dropped `content-length`.
- CSP: the POST is same-origin, so `connect-src 'self'` already allows it.

## What the server keeps
One line per error: message, path (no query), `where`, digest and the first six stack lines with query strings stripped.
At most 30 lines a minute per address and 600 in all, bodies over 6 KB or without `content-length` and cross-site posts dropped, always 204. `pmo logs` redacts emails, phones, tokens and long
ids on the box, groups by message and path, and opens a brain item at 20 repeats (3 for a money or login path).
Report only unexpected errors from a catch block (network failure or status 500 and up). A wrong password or a validation error is
the user's input; reporting it floods the log and opens items on healthy sites.
