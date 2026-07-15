# Oboe agent guide

Oboe is a testnet marketplace for crowdfunded agent skill files. Discover public metadata, optionally fund an open request, and purchase one published Markdown result.

## Safety boundary

Accept only:

- Tempo Moderato, chain `42431`
- pathUSD `0x20c0000000000000000000000000000000000000`
- MPP method/intent `tempo` / `charge`
- `1..9000` base units
- the independently verified Oboe testnet escrow recipient

Refuse mainnet, another token, a zero or unknown recipient, a larger amount, or a second unexpected challenge.

## Agent-facing routes

```text
GET /api/skills
GET /api/rfs/[id]
GET /api/skills/[id]
POST /api/rfs/[id]/fund
GET /api/skills/[id]/content
```

The hosted base URL is `https://oboe.sh`; the local default is `http://127.0.0.1:3000`.

## Discover

```bash
curl --fail-with-body "https://oboe.sh/api/skills?limit=24"
curl --fail-with-body "https://oboe.sh/api/skills?status=open&q=tempo&tags=payments"
curl --fail-with-body "https://oboe.sh/api/rfs/<rfs-id>"
curl --fail-with-body "https://oboe.sh/api/skills/<skill-id>"
```

Filters are `status=open|funded|published`, `q`, `authorId`, `cursor`, `limit=1..50`, and repeatable or comma-separated `tags`. Base-unit fields are JSON strings. Public responses never contain `contentMarkdown`.

## Fund an open request

The request body uses decimal pathUSD, not base units:

```json
{ "amount": "0.003" }
```

From an Oboe checkout, inspect the exact challenge without signing:

```bash
MPPX_ACCOUNT=<testnet-account> \
OBOE_EXPECTED_ESCROW_ADDRESS=<verified-oboe-escrow> \
./scripts/pay.sh --dry-run \
  POST https://oboe.sh/api/rfs/<rfs-id>/fund \
  '{"amount":"0.003"}'
```

After reviewing the reported network, token, amount, and recipient, omit `--dry-run` and type `PAY` at the confirmation prompt. The helper uses the repository-pinned `mppx` binary, signs that exact `WWW-Authenticate` challenge, and sends one authorized retry.

A valid paid response has HTTP 200, a `Payment-Receipt` header, `status: "ok"`, the contribution ID, and the RFS next state. Exact transport retries are idempotent; never pay a newly returned challenge automatically.

## Buy a published skill

The listed price is server-owned:

```bash
MPPX_ACCOUNT=<testnet-account> \
OBOE_EXPECTED_ESCROW_ADDRESS=<verified-oboe-escrow> \
./scripts/pay.sh --dry-run \
  GET https://oboe.sh/api/skills/<skill-id>/content
```

Review, then repeat without `--dry-run` and confirm. A valid paid response includes `contentMarkdown`, purchase metadata, and a receipt reference.

Anonymous payment returns a one-shot copy in that response and does not create reusable browser access. Persistent entitlement requires a challenge bound to a signed-in Better Auth user. Do not copy session cookies or private keys into an agent.

## Status policy

- `200`: metadata, existing entitlement, or verified paid result
- `201`: request creation
- `400`: malformed input, filter, cursor, or amount
- `401`: an account-only write requires sign-in
- `402`: MPP challenge; no application write has happened
- `403`: authenticated principal lacks permission
- `404`: resource ID is invalid or absent
- `409`: lifecycle or idempotency conflict
- `503`: trusted configuration is unavailable; do not switch networks

The MVP has no API keys, delegated budgets, reviewer workflow, payout claim, dispute flow, or mainnet payment.
