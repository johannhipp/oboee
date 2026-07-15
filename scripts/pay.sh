#!/usr/bin/env bash

set -euo pipefail

MODERATO_CHAIN_ID="42431"
MODERATO_PATH_USD="0x20c0000000000000000000000000000000000000"
MODERATO_RPC_URL="${OBOE_MPP_RPC_URL:-https://rpc.moderato.tempo.xyz}"

usage() {
  cat <<'EOF'
Make one guarded Oboe payment on Tempo Moderato.

Usage:
  MPPX_ACCOUNT=<name> OBOE_EXPECTED_ESCROW_ADDRESS=<0x...> \
    ./scripts/pay.sh METHOD URL [JSON_BODY]

Examples:
  MPPX_ACCOUNT=demo OBOE_EXPECTED_ESCROW_ADDRESS=0x... \
    ./scripts/pay.sh POST http://127.0.0.1:3000/api/rfs/<id>/fund '{"amount":"0.001"}'
  MPPX_ACCOUNT=demo OBOE_EXPECTED_ESCROW_ADDRESS=0x... \
    ./scripts/pay.sh GET http://127.0.0.1:3000/api/skills/<id>/content

The script refuses non-Tempo, non-charge, non-Moderato, non-pathUSD, zero,
or above-$0.009 challenges before asking mppx to sign or transfer anything.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

METHOD="${1:-}"
URL="${2:-}"
BODY="${3:-}"
ACCOUNT="${MPPX_ACCOUNT:-}"
EXPECTED_RECIPIENT="${OBOE_EXPECTED_ESCROW_ADDRESS:-}"

if [[ -z "$METHOD" || -z "$URL" || -z "$ACCOUNT" || -z "$EXPECTED_RECIPIENT" ]]; then
  usage >&2
  exit 2
fi
EXPECTED_RECIPIENT=$(printf '%s' "$EXPECTED_RECIPIENT" | tr '[:upper:]' '[:lower:]')
if [[ ! "$EXPECTED_RECIPIENT" =~ ^0x[0-9a-f]{40}$ || "$EXPECTED_RECIPIENT" == "0x0000000000000000000000000000000000000000" ]]; then
  echo "OBOE_EXPECTED_ESCROW_ADDRESS must be a valid nonzero address." >&2
  exit 2
fi
if [[ "$METHOD" != "GET" && "$METHOD" != "POST" ]]; then
  echo "Refusing unsupported method: $METHOD" >&2
  exit 2
fi
if [[ "$METHOD" == "POST" && -z "$BODY" ]]; then
  echo "POST requires a JSON body." >&2
  exit 2
fi

HEADER_FILE=$(mktemp)
BODY_FILE=$(mktemp)
trap 'rm -f "$HEADER_FILE" "$BODY_FILE"' EXIT

CURL_ARGS=(-sS -D "$HEADER_FILE" -o "$BODY_FILE" -w "%{http_code}" -X "$METHOD")
if [[ -n "$BODY" ]]; then
  CURL_ARGS+=(-H "Content-Type: application/json" --data "$BODY")
fi

HTTP_STATUS=$(curl "${CURL_ARGS[@]}" "$URL")
if [[ "$HTTP_STATUS" == "200" ]]; then
  cat "$BODY_FILE"
  exit 0
fi
if [[ "$HTTP_STATUS" != "402" ]]; then
  echo "Expected HTTP 402, received $HTTP_STATUS." >&2
  cat "$BODY_FILE" >&2
  exit 1
fi

CHALLENGE=$(sed -n 's/^www-authenticate: //Ip' "$HEADER_FILE" | head -1 | tr -d '\r')
if [[ -z "$CHALLENGE" ]]; then
  echo "The 402 response did not include WWW-Authenticate." >&2
  exit 1
fi

extract_parameter() {
  local name="$1"
  printf '%s' "$CHALLENGE" | sed -n "s/.*${name}=\"\([^\"]*\)\".*/\1/p"
}

CHALLENGE_METHOD=$(extract_parameter method)
CHALLENGE_INTENT=$(extract_parameter intent)
REQUEST_BASE64=$(extract_parameter request)
if [[ "$CHALLENGE_METHOD" != "tempo" || "$CHALLENGE_INTENT" != "charge" || -z "$REQUEST_BASE64" ]]; then
  echo "Refusing a challenge that is not tempo/charge." >&2
  exit 1
fi

REQUEST_JSON=$(node -e 'process.stdout.write(Buffer.from(process.argv[1], "base64url").toString("utf8"))' "$REQUEST_BASE64")
CHAIN_ID=$(jq -r '.methodDetails.chainId // empty' <<<"$REQUEST_JSON")
CURRENCY=$(jq -r '.currency // empty | ascii_downcase' <<<"$REQUEST_JSON")
RECIPIENT=$(jq -r '.recipient // empty | ascii_downcase' <<<"$REQUEST_JSON")
AMOUNT=$(jq -r '.amount // empty' <<<"$REQUEST_JSON")

if [[ "$CHAIN_ID" != "$MODERATO_CHAIN_ID" ]]; then
  echo "Refusing chain $CHAIN_ID; expected Tempo Moderato ($MODERATO_CHAIN_ID)." >&2
  exit 1
fi
if [[ "$CURRENCY" != "$MODERATO_PATH_USD" ]]; then
  echo "Refusing token $CURRENCY; expected Moderato pathUSD." >&2
  exit 1
fi
if [[ ! "$RECIPIENT" =~ ^0x[0-9a-f]{40}$ || "$RECIPIENT" == "0x0000000000000000000000000000000000000000" ]]; then
  echo "Refusing an invalid or zero recipient." >&2
  exit 1
fi
if [[ "$RECIPIENT" != "$EXPECTED_RECIPIENT" ]]; then
  echo "Refusing recipient $RECIPIENT; expected configured escrow $EXPECTED_RECIPIENT." >&2
  exit 1
fi
if [[ ! "$AMOUNT" =~ ^[0-9]+$ || "$AMOUNT" -lt 1 || "$AMOUNT" -gt 9000 ]]; then
  echo "Refusing amount $AMOUNT; MVP payments must be 1..9000 base units." >&2
  exit 1
fi

echo "Verified Moderato challenge: $AMOUNT pathUSD base units to $RECIPIENT" >&2

if ! AUTHORIZATION=$(npx --yes mppx sign \
  --account "$ACCOUNT" \
  --rpc-url "$MODERATO_RPC_URL" \
  --challenge "$CHALLENGE"); then
  echo "mppx could not sign the verified challenge; no authorized retry was sent." >&2
  exit 1
fi
if [[ ! "$AUTHORIZATION" =~ ^Payment[[:space:]]+ ]]; then
  echo "mppx returned an invalid Authorization value; no authorized retry was sent." >&2
  exit 1
fi
CURL_ARGS+=(-H "Authorization: $AUTHORIZATION")

PAID_STATUS=$(curl "${CURL_ARGS[@]}" "$URL")
if [[ "$PAID_STATUS" != "200" ]]; then
  echo "Paid retry returned HTTP $PAID_STATUS." >&2
  cat "$BODY_FILE" >&2
  exit 1
fi

RECEIPT=$(sed -n 's/^payment-receipt: //Ip' "$HEADER_FILE" | head -1 | tr -d '\r')
if [[ -z "$RECEIPT" ]]; then
  echo "Paid retry returned 200 without a Payment-Receipt; refusing to report success." >&2
  exit 1
fi
if ! jq -e '
  .status == "ok" and
  (.resourceId | type == "string" and length > 0)
' "$BODY_FILE" >/dev/null; then
  echo "Paid retry did not return a valid Oboe application result." >&2
  cat "$BODY_FILE" >&2
  exit 1
fi
echo "Payment-Receipt: $RECEIPT" >&2
cat "$BODY_FILE"
