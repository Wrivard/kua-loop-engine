#!/usr/bin/env bash
# Smoke Cloudflare Access + tunnel pour engine.oryon-temple.ca.
# À ROULER PAR WILLIAM après la config dashboard (voir deploy/cloudflare-checklist.md).
# Lecture seule. Ne crée AUCUN secret ; les secrets éventuels viennent de /srv/kua/.env.
set -u

HOST="${KUA_ENGINE_URL:-https://engine.oryon-temple.ca}"
ENVF="/srv/kua/.env"
FAILED=0
pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; FAILED=1; }
skip() { echo "  ⏭️  $1"; }

echo "Smoke Cloudflare → $HOST"
echo
echo "== 1. /health SANS auth → doit être BLOQUÉ par Access =="
code=$(curl -s -o /dev/null -m 10 -w "%{http_code}" "$HOST/health" 2>/dev/null || echo "000")
case "$code" in
  302 | 303 | 403) pass "bloqué par Access (HTTP $code)" ;;
  200) fail "HTTP 200 SANS auth → Access ne protège PAS le hostname !" ;;
  000) fail "injoignable (DNS/tunnel pas prêts ? hostname ne résout pas ?)" ;;
  *) echo "  ⚠️  HTTP $code (inattendu — à vérifier dans Access)" ;;
esac

echo "== 2. /health AVEC le service token (depuis $ENVF) → doit retourner le JSON health =="
strip() { sed -E 's/^[^=]+=//; s/^["'"'"']//; s/["'"'"']$//'; }
CID=$(grep -E '^CF_ACCESS_CLIENT_ID=' "$ENVF" 2>/dev/null | head -1 | strip)
CSEC=$(grep -E '^CF_ACCESS_CLIENT_SECRET=' "$ENVF" 2>/dev/null | head -1 | strip)
if [ -z "${CID:-}" ] || [ -z "${CSEC:-}" ]; then
  skip "CF_ACCESS_CLIENT_ID/SECRET absents de $ENVF → check sauté (ajoute-les après avoir créé le service token)"
else
  body=$(curl -s -m 10 -H "CF-Access-Client-Id: $CID" -H "CF-Access-Client-Secret: $CSEC" "$HOST/health" 2>/dev/null || echo "")
  if echo "$body" | grep -q '"status"'; then
    pass "JSON health reçu avec le service token"
    echo "     $(echo "$body" | head -c 200)"
  else
    fail "pas de JSON health avec le service token (réponse: $(echo "$body" | head -c 140))"
  fi
fi

echo
if [ "$FAILED" = "0" ]; then
  echo "RÉSULTAT : ✅ OK (ou skip propre)"
else
  echo "RÉSULTAT : ❌ au moins un check a échoué — voir deploy/cloudflare-checklist.md"
fi
exit "$FAILED"
