#!/usr/bin/env bash
# Source from a deploy script and call `record_release <target> [existing-tag]` after the deploy lands.
# Tags the shipped commit release-YYYY-MM-DD<letter>, pushes it, appends a row to docs/DEPLOYS.md and
# opens a GitHub Release. Never fails the deploy. RELEASE_TAG=0 skips all; RELEASE_GH=0 skips the Release.

record_release() (
  local target=${1:-prod} given=${2:-} root sha tag day l dirty="" pushed=0 log
  [ "${RELEASE_TAG:-1}" = 0 ] && return 0
  root=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null) || return 0
  cd "$root" || return 0
  log=docs/DEPLOYS.md

  if [ -n "$given" ]; then
    tag=$given
    sha=$(git rev-list -n1 "$tag" 2>/dev/null) || return 0
  else
    sha=$(git rev-parse HEAD)
    if [ -n "$(git status --porcelain --untracked-files=no -- . ":!$log")" ]; then
      dirty=1
    else
      tag=$(git tag --points-at "$sha" -l 'release-*' | tail -1)
      if [ -z "$tag" ]; then
        git fetch --tags -q 2>/dev/null || true
        day=$(date +%F)
        for l in {a..z}; do
          git rev-parse -q --verify "refs/tags/release-$day$l" >/dev/null || { tag=release-$day$l; break; }
        done
        [ -n "$tag" ] && git tag "$tag" "$sha"
      fi
    fi
  fi

  if [ -n "$tag" ] && git push -q origin "refs/tags/$tag" 2>/dev/null; then pushed=1; fi

  mkdir -p docs
  [ -f "$log" ] || printf '# Deploys\n\n| When | Tag | Commit | Target |\n|---|---|---|---|\n' > "$log"
  printf '| %s | %s | %s | %s |\n' "$(date '+%F %H:%M')" "${tag:-none (uncommitted changes shipped)}" "${sha:0:10}" "$target" >> "$log"
  # Committed by path so the deploy leaves a clean tree; only this file goes in, whatever else is staged.
  git add -- "$log" && git commit -q -m "chore(deploys): log ${tag:-untagged} to $target" -- "$log" >/dev/null \
    || echo "release: $log not committed; commit it by hand" >&2

  if [ "$pushed" = 1 ] && [ "${RELEASE_GH:-1}" != 0 ] && command -v gh >/dev/null 2>&1; then
    gh release view "$tag" >/dev/null 2>&1 \
      || gh release create "$tag" --verify-tag --title "$tag" --generate-notes >/dev/null 2>&1 \
      || echo "release: GitHub Release for $tag not created" >&2
  fi

  echo "release: ${tag:-not tagged (dirty tree)} -> $target (logged in $log)"
  return 0
)
