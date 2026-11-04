#!/usr/bin/env bash
# Run first in every deploy script, before anything is built or shipped. Fails with the reason, naming every failed check.
#   scripts/deploy-preflight.sh --target <box-ip> --domain <host>... [--origin <host>] [--upstream <url|cmd>]... [--fetch <url>]...
# or `source` it and call deploy_preflight with the same flags, or one check on its own:
#   preflight_dns <target-ip> <domain> [origin-host]   preflight_cert <target-ip> <domain>
#   preflight_upstream <url|shell-cmd>                 preflight_fetch <url>
# Env: PREFLIGHT_EXEC runs upstream and fetch probes where the deploy runs them (a command or shell function taking
# one shell string, e.g. your ssh_run); unset = this machine. PREFLIGHT_FETCH_EXEC does the same for --fetch probes
# (preflight_local forces this machine, for builds that run here). PREFLIGHT_ACME_URL, PREFLIGHT_CF_RANGES override the defaults.
# PREFLIGHT_UPSTREAM=0 skips upstream probes, for a deploy that repairs a stack that is down.

PREFLIGHT_ACME_URL_DEFAULT=https://acme-v02.api.letsencrypt.org/directory
PREFLIGHT_CF_RANGES_DEFAULT="173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22"

_pf_fail() { printf 'preflight: %s: %s\n' "$1" "$2" >&2; return 1; }

preflight_local() { bash -c "$1"; }

_pf_exec() {
  local runner=${2:-${PREFLIGHT_EXEC:-}}
  if [ -n "$runner" ]; then "$runner" "$1" </dev/null; else bash -c "$1" </dev/null; fi
}

_pf_ip2int() { local IFS=.; set -- $1; echo $(( ($1 << 24) + ($2 << 16) + ($3 << 8) + $4 )); }

_pf_in_cidr() {
  local ip=$1 net=${2%/*} bits=${2#*/} mask
  mask=$(( (0xFFFFFFFF << (32 - bits)) & 0xFFFFFFFF ))
  [ $(( $(_pf_ip2int "$ip") & mask )) -eq $(( $(_pf_ip2int "$net") & mask )) ]
}

_pf_is_cloudflare() {
  local ip=$1 cidr
  for cidr in ${PREFLIGHT_CF_RANGES:-$PREFLIGHT_CF_RANGES_DEFAULT}; do
    _pf_in_cidr "$ip" "$cidr" && return 0
  done
  return 1
}

_pf_resolve() {
  if command -v dig >/dev/null 2>&1; then
    dig +short +time=3 +tries=2 A "$1" 2>/dev/null
  else
    getent ahostsv4 "$1" 2>/dev/null | awk '{print $1}'
  fi | grep -E '^[0-9]+(\.[0-9]+){3}$' | sort -u || true
}

_pf_http_code() {
  local code
  code=$(_pf_exec "curl -s -o /dev/null -w '%{http_code}' --max-time 15 $(printf '%q' "$1")" "${2:-}" 2>/dev/null) || true
  printf '%s' "${code:-000}"
}

preflight_dns() {
  local target=$1 domain=$2 origin=${3:-} ips ip all_cf=1 list
  ips=$(_pf_resolve "$domain")
  [ -n "$ips" ] || { _pf_fail dns "$domain has no A record"; return 1; }
  [ "$ips" = "$target" ] && return 0
  for ip in $ips; do _pf_is_cloudflare "$ip" || all_cf=0; done
  if [ "$all_cf" = 1 ]; then
    [ -n "$origin" ] || { _pf_fail dns "$domain is behind Cloudflare; pass the origin record (--origin) to prove it points at $target"; return 1; }
    ips=$(_pf_resolve "$origin")
    [ "$ips" = "$target" ] && return 0
    domain="origin $origin"
  fi
  list=$(echo $ips | sed 's/ /, /g')
  _pf_fail dns "$domain resolves to ${list:-nothing}, not $target"
}

preflight_cert() {
  local target=$1 domain=$2 acme code
  if timeout 20 openssl s_client -connect "$target:443" -servername "$domain" </dev/null 2>/dev/null \
    | openssl x509 -noout -checkend 604800 >/dev/null 2>&1; then
    return 0
  fi
  acme=${PREFLIGHT_ACME_URL:-$PREFLIGHT_ACME_URL_DEFAULT}
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$acme" 2>/dev/null) || true
  case "${code:-000}" in
    000 | 5??) _pf_fail cert "no valid certificate for $domain on $target and ACME ($acme) is unreachable"; return 1 ;;
  esac
  return 0
}

preflight_upstream() {
  local probe=$1 code
  [ "${PREFLIGHT_UPSTREAM:-1}" = 0 ] && return 0
  case "$probe" in
    http://* | https://*)
      code=$(_pf_http_code "$probe")
      case "$code" in 000 | 5??) _pf_fail upstream "upstream did not answer: $probe ($code)"; return 1 ;; esac
      ;;
    *)
      _pf_exec "$probe" >/dev/null 2>&1 || { _pf_fail upstream "upstream did not answer: $probe"; return 1; }
      ;;
  esac
}

preflight_fetch() {
  local code
  code=$(_pf_http_code "$1" "${PREFLIGHT_FETCH_EXEC:-${PREFLIGHT_EXEC:-}}")
  case "$code" in
    000) _pf_fail fetch "build fetch target $1 answered 000 (unreachable)"; return 1 ;;
    5??) _pf_fail fetch "build fetch target $1 answered $code"; return 1 ;;
  esac
}

deploy_preflight() {
  local target="" origin="" domains=() upstreams=() fetches=() d u f failed=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --target) target=${2:-}; shift 2 ;;
      --domain) domains+=("${2:-}"); shift 2 ;;
      --origin) origin=${2:-}; shift 2 ;;
      --upstream) upstreams+=("${2:-}"); shift 2 ;;
      --fetch) fetches+=("${2:-}"); shift 2 ;;
      *) echo "preflight: unknown option $1" >&2; return 2 ;;
    esac
  done
  if [ -z "$target" ] || [ "${#domains[@]}" -eq 0 ]; then
    echo "preflight: --target <box-ip> and at least one --domain are required" >&2
    return 2
  fi
  for d in "${domains[@]}"; do
    preflight_dns "$target" "$d" "$origin" || failed=$((failed + 1))
    preflight_cert "$target" "$d" || failed=$((failed + 1))
  done
  for u in ${upstreams[@]+"${upstreams[@]}"}; do preflight_upstream "$u" || failed=$((failed + 1)); done
  for f in ${fetches[@]+"${fetches[@]}"}; do preflight_fetch "$f" || failed=$((failed + 1)); done
  if [ "$failed" -gt 0 ]; then
    echo "preflight failed: $failed check(s); nothing was deployed" >&2
    return 1
  fi
  echo "preflight ok"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then deploy_preflight "$@"; fi
