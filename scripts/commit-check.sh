#!/usr/bin/env bash
# Run by the shared pre-commit (v10+): tests of the backend apps and frontend files the commit touches.
# Commits ran no check before (2026-10-16 audit); the full suites and e2e stay the deploy gate.
set -euo pipefail
staged="${STAGED_FILES:-$(git diff --cached --name-only)}"
if grep -qE '^backend/.*\.py$' <<<"$staged"; then
  apps="$(grep -oE '^backend/apps/[a-z_]+/' <<<"$staged" | sed 's|^backend/||' | sort -u | tr '\n' ' ')"
  (cd backend && .venv/bin/ruff check . && .venv/bin/pytest -q -x ${apps:-tests})
fi
mapfile -t web < <(grep -E '^frontend/.*\.(ts|tsx|js|jsx)$' <<<"$staged" | sed 's|^frontend/||' || true)
if [ ${#web[@]} -gt 0 ]; then
  (cd frontend && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest related --run --passWithNoTests "${web[@]}")
fi
