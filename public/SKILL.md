# Oboe agent guide

Oboe is a testnet marketplace for crowdfunded agent skill files. Use the public API to discover RFSs and published skills, optionally fund an open request, and buy one published Markdown skill.

## Safety boundary

The current service accepts only Tempo Moderato pathUSD:

- chain ID: `42431`
- token: `0x20c0000000000000000000000000000000000000`
- payment method/intent: `tempo` / `charge`
- amount: `1..9000` base units (always below `$0.01`)

Before signing, confirm the 402 challenge matches all four facts and the recipient you intend to pay. Refuse mainnet, another token, a zero/unknown recipient, or a larger amount.

## Base URL

- Hosted service: `https://oboe.sh`
- Local default: `http://localhost:3000`

## Discover public metadata

```bash
curl --fail-with-body "https://oboe.sh/api/skills"
curl --fail-with-body "https://oboe.sh/api/skills?status=open&q=tempo&tags=payments"
curl --fail-with-body "https://oboe.sh/api/rfs/<rfs-id>"
curl --fail-with-body "https://oboe.sh/api/skills/<skill-id>"
```

Filters are `status=open|funded|published`, `q`, `authorId`, and repeatable or comma-separated `tags`. Metadata responses never include `contentMarkdown`.

## Fund an open RFS

The body amount is decimal pathUSD. From an Oboe repository checkout, use the guarded helper:

```bash
MPPX_ACCOUNT=<testnet-account> \
OBOE_EXPECTED_ESCROW_ADDRESS=<verified-oboe-escrow> \
./scripts/pay.sh \
  POST https://oboe.sh/api/rfs/<rfs-id>/fund \
  '{"amount":"0.001"}'
```

The unpaid request returns 402. The guarded script checks the recipient/network/token/amount, signs that exact challenge, and performs one authorized retry. A successful response names the contribution and the RFS's next state.

If the repository helper is unavailable, first make the unpaid request and inspect its `WWW-Authenticate` header. Only after validating every safety fact above, sign that exact header and send one retry:

```bash
export MPPX_ACCOUNT=<testnet-account>
export CHALLENGE='<exact validated WWW-Authenticate value>'
AUTHORIZATION=$(npx --yes mppx sign \
  --account "$MPPX_ACCOUNT" \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --challenge "$CHALLENGE")

curl --fail-with-body -X POST \
  https://oboe.sh/api/rfs/<rfs-id>/fund \
  -H "Authorization: $AUTHORIZATION" \
  -H 'Content-Type: application/json' \
  --data '{"amount":"0.001"}'
```

Never follow a second challenge automatically. A successful paid retry must include a `Payment-Receipt` header and an Oboe JSON result with `status: "ok"`.

## Buy a published skill

```bash
MPPX_ACCOUNT=<testnet-account> \
OBOE_EXPECTED_ESCROW_ADDRESS=<verified-oboe-escrow> \
./scripts/pay.sh \
  GET https://oboe.sh/api/skills/<skill-id>/content
```

The listing price is fixed by the server. A successful paid response includes `contentMarkdown`, purchase metadata, and the receipt reference.

Anonymous payment is supported and returns a one-shot copy in that response. Persistent account entitlement requires starting the 402 request while signed in and paying the exact bound challenge shown by Oboe. Do not copy browser session cookies into an agent.

## Expected statuses

- `200`: metadata, existing entitlement, or verified paid result
- `400`: malformed payload or out-of-range amount
- `401`: create, claim, submit, wallet, or another account-only action requires sign-in
- `402`: valid MPP payment challenge
- `404`: unknown/malformed public resource ID
- `409`: invalid lifecycle state or conflicting replay
- `503`: payment configuration is unavailable; do not retry with another network

There are no API keys, delegated budgets, reviewer workflows, disputes, or mainnet payments in this MVP.
