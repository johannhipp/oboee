# Oboe marketplace MVP contract

This document is the product and domain authority for the current implementation. The executable HTTP authority is `src/lib/api/contract.ts`.

## Scope

Oboe lets demand fund a narrow agent-readable deliverable before it is written. The implemented surface is:

- one bounded, paginated public marketplace projection for open/funded requests and published skill metadata
- text, status, author, and normalized-tag filters
- email/password accounts through Better Auth
- authenticated request creation, first-writer claiming, claimant-only submission, and automatic publication
- Tempo Moderato MPP funding and fixed-price purchases
- account grants for authors, eligible authenticated backers, and purchases bound to a stable account principal
- one-shot content in the verified response for anonymous purchases
- one validated future payout-destination preference per account
- one immutable earnings store for funding and purchase accounting

Full `contentMarkdown` is never part of public catalog or detail metadata.

## Reachable lifecycle

| Current state | Valid action | Result |
|---|---|---|
| `open` | accepted contribution | `open` or `funded` |
| `funded`, unclaimed | authenticated claim | `funded` with claimant |
| `funded`, assigned | assigned claimant submits | `published` with skill |
| `published` | entitled read or exact-price purchase | `published` |

Claimant assignment is orthogonal to status. There are no draft, submitted, fulfilled, cancelled, rejected, locked, paid, or claimed states in the MVP.

## Payment boundary

The only accepted network and currency are Tempo Moderato (chain `42431`) and pathUSD at `0x20c0000000000000000000000000000000000000`. Funding and purchase charges are `1..9000` base units.

The paid flow has two independent trust checks:

1. Next.js verifies the MPP credential and extracts immutable payment facts.
2. Next.js signs a canonical, 30-second server command. `paymentIngress.record` verifies its HMAC, lifetime, principal, resource, amount, token, and global challenge replay before an atomic domain write.

No browser receives the command signature or server secret. Contribution and purchase helpers are not public Convex mutations. Exact retries return the original result; changed reuse returns `IDEMPOTENCY_CONFLICT`.

An anonymous purchase has no stable returning identity, creates no `accessGrants` row, and receives content only in that paid response. A command bound to a Better Auth user may create persistent account access.

## Earnings and wallet semantics

`earningEntries` is the sole accounting source. Each row has a stable funding or purchase source key, gross amount, floor-rounded one-percent platform fee, net amount, researcher, RFS, currency, and creation time. Source-key uniqueness makes retries idempotent.

The dashboard sums these rows as `unsettledTestnetEarningsBaseUnits`. It does not call them paid, claimable, or settled. `payoutWallets` stores only a future destination preference; it is not proof of custody and no code transfers funds to it.

## HTTP contract

Every route, method, auth policy, MPP policy, and resource kind is declared in `src/lib/api/contract.ts` and checked against the Next.js route tree. Request parsers inspect raw JSON and query parameters once. Public DTO mappers select fields explicitly and serialize base units as decimal strings.

Known domain errors map to stable 400/401/403/404/409/503 envelopes. Unknown errors are logged server-side with a correlation ID and return a generic message.

## Runtime configuration

- Next.js server settings are parsed in `src/lib/env/server.ts`.
- Convex settings are parsed in `convex/lib/env.ts`.
- Runtime-neutral Tempo constants and domain policies live in `shared/domain/`.
- Missing trusted settings fail closed on the route that needs them; secrets never use a `NEXT_PUBLIC_` name.

## Explicit non-goals

- mainnet acceptance or automated creator settlement
- claims, refunds, disputes, custody, or private-key storage in the browser
- API keys, delegation, budgets, credential recovery, or wallet recovery
- moderation, reviewer assignment, evidence scoring, approval gates, bonds, or slashing
- reputation, rankings, ratings, versions, or update guarantees
- admin consoles or production migration tooling beyond an explicitly reviewed operation

Paid smoke tests are manual and testnet-only. Normal CI must never sign a credential or move funds.
