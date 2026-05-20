#!/usr/bin/env bash
#
# Smoke test pour cabinet-rimbault-api.
# Exerce tous les endpoints publics + healthcheck + un preflight CORS.
#
# Usage :
#   ./scripts/smoke.sh <base_url> <public_api_key>
#   BASE_URL=https://api.cabinet-rimbault.fr PUBLIC_API_KEY=xxxx ./scripts/smoke.sh
#
# Exit code 0 si tous les checks passent, 1 sinon.

set -uo pipefail

BASE_URL="${1:-${BASE_URL:-}}"
API_KEY="${2:-${PUBLIC_API_KEY:-}}"

if [[ -z "$BASE_URL" || -z "$API_KEY" ]]; then
  echo "Usage: $0 <base_url> <public_api_key>" >&2
  echo "   ou : BASE_URL=... PUBLIC_API_KEY=... $0" >&2
  exit 2
fi

# Retire le slash final si présent
BASE_URL="${BASE_URL%/}"

PASS=0
FAIL=0
CORS_ORIGIN="https://cabinet-rimbault.fr"

check_code() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    printf "  ✓ %-50s (%s)\n" "$name" "$actual"
    PASS=$((PASS + 1))
  else
    printf "  ✗ %-50s (attendu %s, obtenu %s)\n" "$name" "$expected" "$actual"
    FAIL=$((FAIL + 1))
  fi
}

check_match() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    printf "  ✓ %-50s (%s)\n" "$name" "$actual"
    PASS=$((PASS + 1))
  else
    printf "  ✗ %-50s (attendu %s, obtenu %s)\n" "$name" "$expected" "$actual"
    FAIL=$((FAIL + 1))
  fi
}

http_code() {
  curl -s -o /dev/null -w "%{http_code}" "$@"
}

echo "Smoke test : $BASE_URL"
echo

# Healthcheck (pas d'auth requise)
check_code "GET /api/health" "200" "$(http_code "$BASE_URL/api/health")"

# Auth : sans clé doit renvoyer 401
check_code "GET /properties/recent (sans clé)" "401" \
  "$(http_code "$BASE_URL/api/public/properties/recent")"

# Endpoints publics avec clé valide
for path in \
  "/api/public/properties/recent" \
  "/api/public/properties?limit=2" \
  "/api/public/properties/sale" \
  "/api/public/properties/rent"
do
  label="GET ${path#/api/public}"
  check_code "$label" "200" \
    "$(http_code -H "X-API-Key: $API_KEY" "$BASE_URL$path")"
done

# CORS preflight depuis l'origine vitrine prod
cors_origin_header=$(curl -s -i -X OPTIONS \
  -H "Origin: $CORS_ORIGIN" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: X-API-Key" \
  "$BASE_URL/api/public/properties/recent" \
  | grep -i "^access-control-allow-origin:" \
  | tr -d '\r' \
  | awk '{print $2}')
check_match "CORS preflight ($CORS_ORIGIN)" "$CORS_ORIGIN" "$cors_origin_header"

echo
if [[ $FAIL -gt 0 ]]; then
  echo "✗ $FAIL échec(s), $PASS succès"
  exit 1
fi
echo "✓ Tous les checks ($PASS) passent"
