# Oboe marketplace MVP contract

This document is the acceptance boundary for the current product. A feature not listed under “In scope” is not required merely because it appeared in an earlier prototype or QA report.

## Product thesis

Specialists can turn narrow expertise into agent-readable Markdown. Demand is proven before the work is written: someone publishes an RFS, others fund it, a writer fulfills it, and the result becomes a paid skill.

## In scope

### Public catalog

- Browse one mixed catalog of open/funded RFSs and published skills.
- Search by text and filter by status or tags.
- Read public metadata, status, funding progress, prices, and summaries.
- Keep full skill Markdown out of every public metadata response.

### Authenticated author and writer flow

- Email/password sign-up and sign-in through Better Auth.
- Create an RFS with title, description, scope, tags, threshold, and minimum contribution.
- Claim a funded, unclaimed RFS; first valid claimant wins atomically.
- Let only the claimant submit the skill.
- Auto-publish on submit. There is no review state or reviewer role in this MVP.
- Save one validated, nonzero EVM payout wallet per account.

### Payment and entitlement flow

- Fund an open RFS through an MPP `tempo` charge.
- Transition `open -> funded` when accepted contributions reach the threshold.
- Give the skill author and eligible backers account-based access after publication.
- Sell a one-shot copy of published content to everyone else through MPP.
- Record a signed-in principal in the challenge so a cookie-free CLI retry can grant account entitlement.
- Make payment recording server-authorized, exact-amount, exact-token, and idempotent.
- Return stable 400/401/402/403/404/409/503 error envelopes.

### Testnet boundary

- Network: Tempo Moderato, chain ID `42431`.
- Currency: pathUSD at `0x20c0000000000000000000000000000000000000`.
- Every funding and purchase charge is `1..9000` base units, below `$0.01`.
- The application fails closed for any other network, token, missing recipient, or missing secret.

### Payout accounting

- Record creator earnings and the MVP 99/1 creator/platform split.
- Display the accounting balance and saved wallet honestly.
- Do not present an accounting status as an on-chain payout.

## Lifecycle

| State | Allowed action | Next state |
|---|---|---|
| `open` | accepted funding | `open` or `funded` |
| `funded` | one signed-in user claims | `funded` with claimant |
| `funded` with claimant | claimant submits and auto-publishes | `published` |
| `published` | entitled read or paid purchase | `published` |

## Access rules

- Metadata is always public.
- Full content is returned only to the skill author, an account with an access grant, or the verified paid request that created a purchase.
- A paid anonymous request receives content in that one response. Persistent account access requires a challenge bound to a signed-in user.
- Payment recording treats a challenge ID as globally single-use across funding and purchase. Exact re-entry at the recording boundary returns the original result; changed payment facts return `409 IDEMPOTENCY_CONFLICT`.

## Product surface

Pages: `/`, `/browse`, `/browse/[id]`, `/new`, `/me`, `/sign-in`, and `/docs`.

API routes:

- `GET /api/skills`
- `GET /api/skills/[id]`
- `GET /api/skills/[id]/content`
- `POST /api/rfs`
- `GET /api/rfs/[id]`
- `POST /api/rfs/[id]/fund`
- `POST /api/rfs/[id]/claim`
- `POST /api/rfs/[id]/submit`
- `POST /api/me/wallet`
- `/api/auth/*`

## Explicitly out of scope

- API keys, delegated authority, delegated budgets, credential recovery, or wallet recovery
- applicant queues, application scoring, reviewer assignment, review bonds, or slashing
- moderation, evidence bundles, automated evaluation, quality scoring, or approval gates
- reputation, rankings, ratings, version history, update guarantees, or trust badges
- disputes, refunds, appeals, arbitration, or legal/compliance workflows
- admin consoles, operations dashboards, production observability programs, or policy migrations
- automated on-chain payout settlement or payout claims
- mainnet payment acceptance

These may become separate, evidence-driven product proposals. They are not hidden MVP requirements.

## Release criteria

1. Unit tests cover capabilities, payment validation, replay handling, seed boundaries, serialization, and money formatting.
2. Typecheck, lint, and production build pass.
3. Browser E2E covers public discovery, auth, wallet persistence, RFS creation, and the 402 handoff.
4. At least one real Moderato funding payment and one real Moderato purchase are independently verified by transaction receipt.
5. Desktop and mobile dogfood find no unresolved critical or high issue in the core flow.
