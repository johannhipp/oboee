# Plan 003: Consolidate testnet earnings, wallet preference, and runtime configuration

> Executor instructions: The selected MVP is Tempo Moderato and accounting
> only. Never use `claimed`, `paid`, `claimable`, or transfer-receipt language
> for an amount that has not been settled on-chain. Preserve the concurrent
> worktree, migrate additively, and mark this plan DONE only when the old payout
> stores and placeholder payout surfaces are gone.
>
> Drift check: git diff --stat 7143943..HEAD -- .env.example convex/auth.ts
> convex/users.ts convex/schema.ts convex/rfs.ts convex/purchases.ts
> convex/payouts.ts src/lib/mpp.ts src/lib/tempo.ts src/app/api/me/wallet
> src/app/api/rfs/[id]/payout src/app/me/page.tsx

## Status

- Status: DONE
- Priority: P1
- Effort: L
- Risk: HIGH
- Depends on: Plans 001 and 002
- Category: bug, migration, architecture, product-contract
- Planned at: commit 7143943, reconciled with the uncommitted worktree on
  2026-07-15

## Why this matters

The clean baseline exposed a payout endpoint that performed no transfer while
marking rows claimed. Concurrent work correctly removes that route and states
that automated settlement is outside the testnet MVP, but it leaves two
incompatible accounting stores in place. Funding earnings live in
`payoutLedger`; purchase earnings live in `payoutEntries`; the new dashboard
total reads only the former. A six-line `convex/payouts.ts` module now exists
only to export `automatedPayoutsEnabled = false`, which is a placeholder rather
than a useful abstraction.

Wallet and environment work is also partial. `payoutWallets` is a reasonable
application-owned preference store, but its validation is repeated in Convex
and the client and it has no explicit future-settlement contract. MPP
configuration now fails closed for Tempo Moderato, while site URL and trusted
payment settings still have multiple runtime owners.

## Current state at reconciliation

- `convex/rfs.ts` creates one funding row in `payoutLedger` when a submission
  is published.
- `convex/purchases.ts` creates one `payoutEntries` row per purchase.
- `convex/users.ts` computes `claimablePayoutBaseUnits` from `payoutLedger`
  only, omitting purchase earnings.
- `convex/payouts.ts` contains no behavior; its explanatory comment and boolean
  export merely encode absence of a feature.
- `src/app/api/rfs/[id]/payout/claim/route.ts` is deleted in the concurrent
  worktree, which avoids the baseline’s false-settlement behavior.
- `convex/schema.ts`, `convex/users.ts`, `src/app/api/me/wallet/route.ts`,
  `src/components/payout-wallet-form.tsx`, and `src/app/me/page.tsx` partially
  implement a separate payout-wallet preference.
- `src/lib/mpp.ts` now validates an explicit `tempo-moderato` network, pathUSD,
  recipient, secret, and optional fee payer. `.env.example` still contains
  both `SITE_URL` and `NEXT_PUBLIC_SITE_URL`; Convex and Next parse trusted
  settings independently.

## Target model

- `earningEntries` is the sole accounting source for both funded-request and
  purchased-skill earnings.
- Each immutable entry has one stable source key, researcher, RFS, source kind,
  gross, fee, net, currency, and creation time. It has no settlement status in
  this MVP because no settlement workflow exists.
- The profile reports `unsettledTestnetEarningsBaseUnits`, not a claimable or
  paid balance.
- `payoutWallets` is the sole optional future-destination preference, with one
  server validator and one typed read/write API. UI validation is advisory;
  the server validator is authoritative.
- Each runtime has one environment parser. Moderato chain, token, and default
  RPC constants have one owner.
- No claim route, claim mutation, `paid` state, fabricated receipt, or
  feature-flag placeholder exists until a separately authorized settlement
  project is designed.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Focused tests | npm test -- earnings wallet env | all pass |
| Full tests | npm test | all pass |
| Codegen | npx convex codegen | exit 0 |
| Typecheck | npm run typecheck | exit 0 |
| Lint | npm run lint | exit 0 |
| Build | npm run build | exit 0 |

## Scope

In scope:

- `.env.example`
- `convex/schema.ts`
- `convex/rfs.ts`
- `convex/purchases.ts`
- `convex/users.ts`
- `convex/payouts.ts` (remove after readers/writers migrate)
- `convex/lib/env.ts` (create)
- `convex/lib/wallet.ts` (create if it removes the real duplicate)
- `convex/migrations/earnings.ts` (create only when persisted rows exist)
- `src/lib/env/server.ts` (create)
- `src/lib/mpp.ts`
- `src/lib/tempo.ts`
- `src/app/api/me/wallet/route.ts`
- `src/components/payout-wallet-form.tsx`
- `src/app/me/page.tsx`
- Focused tests and regenerated Convex bindings

Out of scope:

- On-chain payout execution, custody, claims, refunds, or disputes
- Restoring the deleted claim route under another name
- Storing a private key in client-visible configuration
- Adding a settlement status “for later” without a state machine and provider
- Deleting legacy accounting rows before a reconciliation proves parity

## Git workflow

- Suggested branch: `johann/003-testnet-earnings`.
- First split the concurrent wallet/configuration edits from unrelated paywall
  and UI changes without discarding either.
- Commit schema expansion, writer cutover, reader cutover, and legacy removal
  as separate verifiable units.
- Do not deploy migrations without explicit operator instruction.

## Steps

### Step 1: Lock the accounting-only product contract in tests

Add tests that prove:

- Funding and purchase earnings are both visible in one dashboard total.
- Replaying a source event cannot add a second earning entry.
- No public or authenticated API can mark an earning paid or claimed.
- No route exists under `/api/rfs/[id]/payout/claim`.
- UI copy says “unsettled testnet earnings” and never implies funds were sent.

Keep the baseline false-claim behavior deleted. Do not replace it with a
boolean flag or a route that always returns “not implemented.”

Verify: `npm test -- earnings`

Expected: characterization tests fail only on the two-store total and current
misleading naming before implementation.

### Step 2: Give each runtime one configuration parser

Create a Next-only parser for Better Auth, Convex, and MPP server settings and
a Convex-only parser for site URL and the Plan 002 server-command verifier.
Share only runtime-neutral Moderato constants from `src/lib/tempo.ts` or a
root-level shared module; do not import a Next server module into Convex.

Choose one canonical site URL variable. Browser-safe values may use
`NEXT_PUBLIC_`; secrets and authoritative origins may not. Validate URLs,
addresses, chain ID, pathUSD, secret lengths, and the optional fee-payer key.
Preserve lazy initialization so unrelated public pages can render when payment
configuration is absent, while every payment path fails closed.

Update `.env.example` to label which values belong in Next versus Convex.
Never include a live value.

Verify:

- `rg -n 'process\.env\.' src convex --glob '*.ts'`
- `npm test -- env`

Expected: each setting is read by one parser per runtime; no zero-address or
implicit network fallback remains.

### Step 3: Finish the wallet preference as one bounded component

Keep `payoutWallets` application-owned rather than duplicating the same field
inside Better Auth. Rename fields and copy to make its semantics explicit: it
is a future payout destination preference, not proof of custody and not an
active settlement account.

Move address normalization and zero-address rejection to one Convex boundary
helper. Keep lightweight client validation only for immediate feedback and
write a shared test vector used by both layers. Ensure the `by_user` lookup is
logically unique and repeated updates patch the same row.

Add tests for unauthenticated writes, mixed-case normalization, malformed and
zero addresses, repeated updates, and dashboard persistence. If no committed
product surface consumes the preference after the UI is reconciled, remove the
table, endpoint, form, and copy together rather than keeping dead plumbing.

Verify: `npm test -- wallet`

Expected: one persisted row per user and deterministic typed responses.

### Step 4: Introduce one immutable earnings table additively

Add `earningEntries` with:

- `sourceKey`: `funding:<rfsId>` or `purchase:<purchaseId>`
- RFS ID, researcher user ID, source kind, and optional purchase ID
- gross, platform fee, and net base-unit amounts
- normalized currency address and creation time

Index the stable source key for idempotency and researcher/currency for the
dashboard. Put fee-split math in Plan 004’s canonical money module and assert
`gross = fee + net` for every row.

Change RFS publication and purchase recording to insert exactly one earning
entry in the same transaction as the source event. Preserve the existing
tables temporarily only if persisted data must be migrated.

Verify: `npm test -- earnings`

Expected: both source kinds use the same writer helper and exact retry creates
no duplicate entry.

### Step 5: Reconcile and migrate existing accounting rows

Before backfill, query only aggregate counts and sums for `payoutLedger`,
`payoutEntries`, and `earningEntries`; never print user IDs or wallet values.
Map each legacy row to a stable source key and fail on overlap or missing source
records instead of guessing.

Run the migration twice. The first run must report balanced counts/totals; the
second must create zero rows. Save the aggregate reconciliation output in the
change description or an operator artifact, not in a source comment.

STOP if deployed rows cannot map one-to-one or if no deployment is available
to establish whether migration is necessary.

### Step 6: Cut readers over and remove payout-shaped placeholders

Switch `getDashboard` and profile DTOs to `earningEntries`. Rename
`claimablePayoutBaseUnits` to `unsettledTestnetEarningsBaseUnits` and render the
currency without floating-point rounding.

After reconciliation, remove `payoutLedger`, `payoutEntries`, their indexes and
writers, the deleted claim route’s references, and `convex/payouts.ts`. Do not
keep `automatedPayoutsEnabled = false`; product scope belongs in the canonical
spec and route manifest, not a no-op source module.

Regenerate Convex bindings and confirm generated changes contain no legacy
payout functions.

### Step 7: Run the complete verification gate

Run, in order:

1. `npm test`
2. `npx convex codegen`
3. `npm run lint`
4. `npm run typecheck`
5. `npm run build`

Expected: all pass, the dashboard total includes both earning source kinds,
and no code path can claim settlement occurred.

## Done criteria

- [x] Tempo Moderato/accounting-only scope is explicit and tested.
- [x] Each runtime has one typed configuration parser.
- [x] Wallet preference has one storage owner and one authoritative validator,
      or the unused preference is removed as a complete vertical slice.
- [x] Every earning source creates exactly one immutable earning entry.
- [x] Funding and purchase totals reconcile before legacy tables are removed.
- [x] No claim route, payout mutation, false receipt, settlement status, or
      no-op payout feature module remains.
- [x] Profile/API copy says unsettled testnet earnings and formats base units
      without floating-point loss.
- [x] Tests, codegen, lint, typecheck, and build pass.
- [x] Plan 003 is marked DONE in `plans/README.md`.

## STOP conditions

- Existing deployed accounting data cannot be reconciled one-to-one.
- The product requires real settlement now; that requires a separately scoped
  provider/custody design and explicit authority, not an expansion of this
  accounting plan.
- A required trusted setting can only be exposed with `NEXT_PUBLIC_`.
- Wallet preference has no committed consumer and stakeholders require it to
  remain anyway; document that product decision before retaining the slice.
- Migration or codegen requires production credentials that are unavailable.

## Maintenance notes

Accounting facts are immutable source events, not an aspirational payout state
machine. Add settlement only when a provider, custody model, idempotent claim
lifecycle, and authoritative receipt lookup exist together. Operational scope
belongs in docs and contract tests; comments should explain non-obvious code,
not stand in for missing behavior.
