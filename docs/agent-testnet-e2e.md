# Guarded agent smoke test on Tempo Moderato

This is a manual testnet run. It moves pathUSD only after a human verifies the challenge and types `PAY`. CI must never run it.

## Preconditions

- Oboe is configured with `MPP_NETWORK=tempo-moderato` and the expected escrow.
- `npm ci` has installed the repository-pinned `mppx` binary.
- The selected `MPPX_ACCOUNT` is a funded disposable Moderato account.
- The operator independently knows the configured escrow address.
- The amount remains `1..9000` base units.

```bash
export OBOE_BASE_URL=http://127.0.0.1:3000
export MPPX_ACCOUNT=oboe-demo
export OBOE_EXPECTED_ESCROW_ADDRESS=<verified-testnet-escrow>
```

## 1. Discover metadata

```bash
curl --fail-with-body "$OBOE_BASE_URL/api/skills?status=open&limit=24"
curl --fail-with-body "$OBOE_BASE_URL/api/skills?status=published&limit=24"
```

Choose one RFS ID and one skill ID. Catalog and detail responses must not contain `contentMarkdown`.

## 2. Inspect, then fund

```bash
./scripts/pay.sh --dry-run \
  POST "$OBOE_BASE_URL/api/rfs/<rfs-id>/fund" \
  '{"amount":"0.001"}'
```

Confirm the output reports chain `42431`, Moderato pathUSD, `1000` base units, and the expected escrow. Then run the same command without `--dry-run`; type `PAY` only after the facts still match.

Expected persisted facts:

- one accepted contribution and one global payment event for the challenge
- the public funding total increases exactly once
- the RFS remains open or transitions once to funded
- an anonymous run records a payment reference, not a fabricated user ID

## 3. Inspect, then purchase

```bash
./scripts/pay.sh --dry-run \
  GET "$OBOE_BASE_URL/api/skills/<skill-id>/content"
```

Review the same safety facts, repeat without `--dry-run`, and confirm. The 200 response must include `contentMarkdown`, a purchase ID, receipt reference, and a `Payment-Receipt` header.

Expected persisted facts:

- one purchase, one global payment event, and one immutable purchase earning
- no reusable access grant for an anonymous payment
- public metadata remains redacted after the purchase
- an exact retry creates no duplicate purchase or earning

## 4. Reconcile

- Compare the receipt's successful pathUSD transfer with the reported amount and escrow.
- Confirm the dashboard labels creator value as unsettled testnet earnings.
- Record only aggregate counts/totals in QA notes; do not copy user IDs, wallet values, credentials, or secrets.
- Keep test records if they support QA. If cleanup is required, use a separately reviewed data operation rather than deleting source events ad hoc.

Mainnet, production escrow custody, and creator settlement are deferred readiness projects. This smoke plan must not be adapted to them by changing only a URL or token.
