#!/usr/bin/env bash
# Deploy the Django API (api.kullmart.com) to the shared edge VPS.
#
# Usage:
#   deploy/deploy-api.sh              # build the image here, ship it, start, vhost, smoke test
#   SKIP_VHOST=1 deploy/deploy-api.sh # rebuild/restart only, don't touch Caddy
set -euo pipefail

SSH_HOST="${SSH_HOST:-arif@169.58.218.225}"
SSH_PORT="${SSH_PORT:-41383}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/ordernest_deploy_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/home/arif/website/kull-mart-api}"
EDGE_REPO="${EDGE_REPO:-$HOME/projects/edge}"
HEALTH_PORT=4361
SITE_HOST="${SITE_HOST:-api.kullmart.com}"
SKIP_VHOST="${SKIP_VHOST:-0}"

source "$(dirname "$0")/deploy-ship.sh"
ssh_opts
ssh_run() { ssh "${SSH_OPTS[@]}" "$SSH_HOST" "$@"; }

step() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!! \033[0m%s\n' "$*" >&2; }
die()  { printf '\033[1;31m!! \033[0m%s\n' "$*" >&2; exit 1; }

cd "$(dirname "$0")/.."
LOCAL_ROOT="$(pwd)"

step "Local pre-flight"
git diff --quiet -- backend docker-compose.prod.yml || warn "Uncommitted backend changes: the image is built from disk, not HEAD."
echo "  target: $SSH_HOST:$REMOTE_DIR"

step "Verify SSH, docker, edge network and .env on the VPS"
ssh_run "mkdir -p '$REMOTE_DIR' && docker compose version" || die "edge VPS not ready"
ssh_run "docker network inspect edge >/dev/null" || die "'edge' network not found: deploy ~/projects/edge first"
ssh_run "test -f '$REMOTE_DIR/.env'" || die "$REMOTE_DIR/.env missing: copy deploy/api.env.example there and fill it in"

resolved=$(dig +short "$SITE_HOST" | head -1)
[[ "$resolved" == "169.58.218.225" ]] || warn "$SITE_HOST resolves to '${resolved:-nothing}', not 169.58.218.225 (DNS-only): Caddy cannot issue a certificate until it does"

step "Sync compose file"
rsync -az -e "ssh ${SSH_OPTS[*]}" "$LOCAL_ROOT/docker-compose.prod.yml" "$SSH_HOST:$REMOTE_DIR/"

step "Build image locally"
TAG="$(deploy_tag)"
DOCKER_BUILDKIT=1 docker build -t "kull-mart-api:$TAG" "$LOCAL_ROOT/backend"
step "Ship $TAG + start"
PREV="$(running_tag kull-mart-api "$SSH_HOST")"
ship_image "kull-mart-api:$TAG" "$SSH_HOST"
ssh_run "cd '$REMOTE_DIR' && sed -i '/^IMAGE_TAG=/d' .env && echo IMAGE_TAG=$TAG >> .env && IMAGE_TAG=$TAG docker compose -f docker-compose.prod.yml up -d --no-build --remove-orphans db api"
# SECURE_SSL_REDIRECT is on, so the health probe presents itself as Caddy would.
ssh_run "
ok=0
for i in \$(seq 1 45); do
    curl -sf -H 'Host: $SITE_HOST' -H 'X-Forwarded-Proto: https' http://127.0.0.1:$HEALTH_PORT/health/ >/dev/null && ok=1 && break
    sleep 2
done
if [ \$ok -eq 0 ]; then
    docker compose -f '$REMOTE_DIR/docker-compose.prod.yml' logs --tail=80 api >&2
    exit 1
fi
" || die "api did not become healthy within 90s"

if [[ "$SKIP_VHOST" != "1" ]]; then
    step "Push Caddy vhost + reload (locked against concurrent edge deploys)"
    scp -P "$SSH_PORT" -i "$SSH_KEY" "$LOCAL_ROOT/deploy/kullmart-api.caddy" "$SSH_HOST:/tmp/kullmart-api.caddy"
    "$EDGE_REPO/scripts/with-edge-lock.sh" "$SSH_HOST" "${SSH_OPTS[@]}" -- bash -s <<'REMOTE'
set -euo pipefail
cp /tmp/kullmart-api.caddy /home/arif/website/edge/sites/kullmart-api.caddy
docker run --rm -v /home/arif/website/edge/Caddyfile:/etc/caddy/Caddyfile:ro \
    -v /home/arif/website/edge/sites:/etc/caddy/sites:ro \
    caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec edge-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
REMOTE
else
    warn "SKIP_VHOST=1: Caddy vhost not touched"
fi

source "$LOCAL_ROOT/deploy/release-tag.sh"
record_release prod || true

prune_old_tags kull-mart-api "$TAG" "$PREV" "$SSH_HOST"
prune_old_tags kull-mart-api "$TAG" "$PREV"

step "Smoke test"
for i in 1 2 3 4 5 6; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "https://$SITE_HOST/health/" || true)
    [[ "$code" == "200" ]] && { echo "  https://$SITE_HOST/health/ -> 200"; exit 0; }
    sleep 5
done
die "https://$SITE_HOST/health/ -> $code (check the DNS-only A record and Caddy certificate issuance)"
