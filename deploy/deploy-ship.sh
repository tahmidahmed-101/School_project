#!/usr/bin/env bash
# Source from a deploy script: build the image on this machine, ship it, never build on the shared edge box.
#   ssh_opts                                       fills SSH_OPTS from SSH_PORT, SSH_KEY and an optional SSH_JUMP (-J host)
#   deploy_tag                                     commit sha, plus -dirty<time> when the tree has uncommitted changes
#   remote_env <target> <file> <VAR>...            exports those KEY=value lines from a remote .env (build args)
#   running_tag <container> <target>               tag of the image a container runs now, empty if none
#   ship_image <image:tag> <target>                docker save | gzip -1 | ssh docker load, retried once
#   prune_old_tags <repo> <keep> <prev> [target]   removes every other tag of <repo> here, or on target; keeps running + previous
# The caller sets SSH_PORT/SSH_KEY first. Build with `docker build` (BuildKit layer cache; no --pull, no builder prune).

ssh_opts() {
  local sock=${TMPDIR:-/tmp}
  [ ${#sock} -gt 60 ] && sock=/tmp
  SSH_OPTS=(-o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=4
    -o ControlMaster=auto -o "ControlPath=$sock/deploy-%C" -o ControlPersist=60)
  [ -n "${SSH_PORT:-}" ] && SSH_OPTS+=(-p "$SSH_PORT")
  [ -n "${SSH_KEY:-}" ] && SSH_OPTS+=(-i "$SSH_KEY" -o IdentitiesOnly=yes)
  [ -n "${SSH_JUMP:-}" ] && SSH_OPTS+=(-J "$SSH_JUMP")
  return 0
}

_ssh_opts_ready() { declare -p SSH_OPTS >/dev/null 2>&1 || ssh_opts; }

deploy_tag() {
  local sha
  sha=$(git rev-parse --short=10 HEAD) || return 1
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then sha=$sha-dirty$(date +%H%M%S); fi
  echo "$sha"
}

remote_env() {
  local target=$1 file=$2 line v re
  shift 2
  re=$(IFS='|'; echo "$*")
  _ssh_opts_ready
  while IFS= read -r line; do
    v=${line#*=}
    case $v in \"*\" | \'*\') v=${v:1:${#v}-2} ;; esac
    export "${line%%=*}=$v"
  done < <(ssh "${SSH_OPTS[@]}" "$target" "grep -E '^($re)=' '$file'" 2>/dev/null || true)
}

running_tag() {
  _ssh_opts_ready
  ssh "${SSH_OPTS[@]}" "$2" "docker inspect -f '{{.Config.Image}}' '$1' 2>/dev/null" 2>/dev/null | sed -n '1s/.*://p'
}

ship_image() {
  local image=$1 target=$2 try
  _ssh_opts_ready
  for try in 1 2; do
    if (set -o pipefail; docker save "$image" | gzip -1 | ssh "${SSH_OPTS[@]}" "$target" 'gunzip | docker load'); then return 0; fi
    echo "ship_image: attempt $try of 2 failed for $image" >&2
  done
  return 1
}

_prune_tags_here() {
  local t
  docker image ls --format '{{.Tag}}' "$1" | { grep -vxF -e "$2" -e "$3" -e '<none>' || true; } \
    | while read -r t; do docker rmi "$1:$t" >/dev/null 2>&1 || true; done
  docker image prune -f >/dev/null
}

prune_old_tags() {
  local repo=$1 keep=$2 prev=${3:-} target=${4:-}
  if [ -z "$target" ]; then _prune_tags_here "$repo" "$keep" "$prev"; return 0; fi
  _ssh_opts_ready
  ssh "${SSH_OPTS[@]}" "$target" "$(declare -f _prune_tags_here); _prune_tags_here $(printf '%q ' "$repo" "$keep" "$prev")" || true
}
