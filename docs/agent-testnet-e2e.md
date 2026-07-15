# Agent E2E on Tempo Moderato

This is the supported one-shot agent demo for the MVP. It is testnet-only and every payment must remain below `$0.01`.

## Prerequisites

- Oboe is running with `MPP_NETWORK=tempo-moderato`.
- `mppx` has a funded Tempo Moderato account.
- Set `MPPX_ACCOUNT` explicitly. Do not let a script guess which wallet to spend from.

```bash
export OBOE_BASE_URL=http://127.0.0.1:3000
export MPPX_ACCOUNT=oboe-demo
export OBOE_EXPECTED_ESCROW_ADDRESS=<the-configured-testnet-escrow>
```

## Discover

```bash
curl --fail-with-body "$OBOE_BASE_URL/api/skills?status=open"
curl --fail-with-body "$OBOE_BASE_URL/api/skills?status=published"
```

Catalog and detail responses contain metadata only. They must not contain `contentMarkdown`.

## Fund one request

Choose an open RFS ID and an amount between `0.000001` and `0.009` pathUSD:

```bash
MPPX_ACCOUNT="$MPPX_ACCOUNT" scripts/pay.sh \
  POST "$OBOE_BASE_URL/api/rfs/<rfs-id>/fund" \
  '{"amount":"0.001"}'
```

The script validates the unpaid `402` challenge. It refuses any method other than a Tempo charge, any chain other than `42431`, any token other than Moderato pathUSD, a recipient different from the explicitly configured escrow, or an amount outside the test cap. It signs that exact challenge and sends exactly one authorized retry; it never pays a second, freshly discovered challenge.

## Buy one published skill

Choose a published skill ID:

```bash
MPPX_ACCOUNT="$MPPX_ACCOUNT" scripts/pay.sh \
  GET "$OBOE_BASE_URL/api/skills/<skill-id>/content"
```

The successful response includes `contentMarkdown`, purchase metadata, and a receipt reference. An anonymous paid response is one-shot; to persist access to an Oboe account, begin the 402 flow while signed in and use the exact command shown in the browser.

## Pass criteria

- unpaid request returns `402` with `tempo`, `charge`, chain `42431`, pathUSD, expected recipient, and exact amount
- one paid retry returns `200`
- transaction receipt status is successful and its token transfer matches amount and escrow
- funding updates the public RFS total once
- purchase returns full content once while public metadata remains redacted
- no mainnet endpoint, token, key, or transfer is used
