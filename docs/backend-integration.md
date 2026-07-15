# Backend and payment integration

This describes the implemented MVP, not a future architecture plan.

## Runtime boundaries

- Next.js App Router owns pages, JSON route handlers, auth-cookie lookup, MPP challenge/verification, and stable HTTP responses.
- Convex owns marketplace records, authorization decisions, state transitions, entitlement, and idempotent payment recording.
- Better Auth runs through the Convex integration and the Next `/api/auth/*` proxy.
- Tempo Moderato settles pathUSD test payments to one configured escrow address.

The paid HTTP route is the only component allowed to call the protected Convex payment mutations. It supplies `OBOE_PAYMENT_RECORDING_SECRET`; Convex compares that secret in constant time before accepting payment facts.

## Data model

The marketplace uses nine application tables:

- `rfs`: author, optional claimant, request copy, tags, thresholds, token, amount, and lifecycle state
- `contributions`: backer principal, exact amount/token, challenge ID, receipt reference, status
- `skills`: one submitted Markdown skill per RFS, summary, tags, price, status
- `purchases`: buyer principal, exact amount/token, challenge ID, receipt reference
- `accessGrants`: account entitlement from backing or purchase
- `payoutWallets`: one saved payout address per account
- `payoutLedger` and `payoutEntries`: accounting only; no settlement claim endpoint
- `paymentEvents`: normalized funding and purchase audit facts

Better Auth component tables are managed separately by its Convex component.

## Payment boundary

`src/lib/mpp.ts` rejects configuration unless all of these are true:

- `MPP_NETWORK=tempo-moderato`
- funding token equals Moderato pathUSD
- the escrow address is a valid nonzero address
- MPP and recording secrets are at least 32 characters
- RPC is HTTPS, except an explicit localhost test RPC
- an enabled fee payer has a valid 32-byte private key

`POST /api/rfs/[id]/fund` parses a decimal pathUSD amount and caps it at 9000 base units. `GET /api/skills/[id]/content` charges the listing's exact stored price and rejects listings above the cap. The verified credential—not the request body—is authoritative when Convex records amount, token, challenge, and receipt.

A signed-in initial request adds the Better Auth user ID as an HMAC-bound MPP `externalId`. This lets a separate `mppx` process complete the retry without copying the user's auth cookie. Convex rejects any mismatch between that signed payment principal and an authenticated principal.

## Idempotency

Challenge IDs are indexed in both the domain record and the global `paymentEvents` ledger. Re-entering the recording boundary with the same immutable payment facts returns the original contribution or purchase. Reusing one challenge across funding and purchase, or with a different resource, principal, amount, token, or receipt, fails with `IDEMPOTENCY_CONFLICT`. The RFS total and payout accounting are therefore not incremented twice.

## Environment

Copy `.env.example` and provide:

| Variable | Location | Purpose |
|---|---|---|
| `BETTER_AUTH_SECRET` | Next + Convex | Better Auth signing secret |
| `SITE_URL` / `NEXT_PUBLIC_SITE_URL` | Next + Convex | trusted application origin |
| `NEXT_PUBLIC_CONVEX_URL` | Next | Convex functions URL |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Next | Convex HTTP/auth site URL |
| `MPP_SECRET_KEY` | Next | MPP challenge signing secret |
| `MPP_NETWORK` | Next | must be `tempo-moderato` |
| `MPP_RECIPIENT_ESCROW_ADDRESS` | Next | testnet escrow recipient |
| `MPP_FUNDING_TOKEN_ADDRESS` | Next | Moderato pathUSD |
| `OBOE_MPP_RPC_URL` | Next | Moderato RPC endpoint |
| `OBOE_PAYMENT_RECORDING_SECRET` | Next + Convex | protects payment mutations |
| `OBOE_SEED_SECRET` | Convex | protects explicit fixture mutations |

`MPP_ENABLE_FEE_PAYER` is false by default. If enabled, `MPP_FEE_PAYER_PRIVATE_KEY` must be a dedicated testnet key.

## Development deployment

Use a separate Convex development project for MVP QA. Run `npx convex dev --once` after schema or function changes so generated types and deployed functions agree. Seed helpers are never public without the configured seed secret.

Do not point this schema at a policy-v2 production deployment without a reviewed data migration.
