# Plan 004: Centralize domain types, validators, and lifecycle policy

> Executor instructions: Consolidate only after Plans 002 and 003 have settled
> the security and payout shapes. Preserve behavior with tests before moving
> helpers. Mark Plan 004 DONE in plans/README.md when every duplicate-owner
> grep and migration check passes.
>
> Drift check: git diff --stat 7143943..HEAD -- convex/schema.ts convex/rfs.ts
> convex/skills.ts convex/purchases.ts convex/contributions.ts convex/users.ts
> src/lib/types.ts src/lib/view-models.ts shared

## Status

- Status: DONE
- Priority: P1
- Effort: M
- Risk: MED
- Depends on: Plans 002 and 003
- Category: tech-debt, architecture, migration
- Planned at: commit 7143943, reconciled with the uncommitted worktree on
  2026-07-15

## Why this matters

The same domain concepts currently have several independent definitions.
Status validators, document validators, tag cleanup, wallet validation, fee
splits, auth guards, and six-decimal amount conversions can drift without the
compiler noticing. Several declared states are not real workflows at all,
which has already led the UI to relabel cancelled as fulfilled.

## Current state

- RFS status is defined in convex/schema.ts:16-22, convex/rfs.ts:9-15,
  convex/contributions.ts:6-12, convex/skills.ts:37-43,
  convex/users.ts:64-70, convex/seeds.ts:121-127, and
  src/lib/types.ts:1.
- Concurrent `convex/lib/capabilities.ts` adds another private
  `SubmittableStatus` union. Its pure `canSubmitRfs` policy is worth keeping,
  but its input type must come from the canonical status owner.
- Full RFS document validators are duplicated in convex/rfs.ts:17-31 and
  convex/skills.ts:24-44.
- Full skill document validators are duplicated in convex/skills.ts:12-22 and
  convex/purchases.ts:6-16.
- cleanTags is duplicated in convex/rfs.ts:33-40 and convex/skills.ts:64-71.
- computeFeeSplit is duplicated in convex/rfs.ts:53-57 and
  convex/purchases.ts:18-22.
- Wallet/address regexes now exist in `convex/rfs.ts`, `convex/users.ts`,
  `src/lib/mpp.ts`, and concurrent `src/components/payout-wallet-form.tsx`.
- Auth guards are reimplemented across Convex domain mutations and Next route
  handlers; the baseline payout copy is being removed by Plan 003.
- Six-decimal conversion exists in src/lib/view-models.ts:4-13,
  rfs-actions.tsx:17-27, fund/route.ts:9-26, and content/route.ts:9-17.
- schema declares RFS cancelled, contribution rejected, skill draft/submitted,
  and payout locked. No current write produces those states.
- rfs.submit patches funded -> fulfilled -> published within one Convex
  transaction (convex/rfs.ts:354-359), so fulfilled is not observable.
- src/lib/view-models.ts:35 and browse/[id]/page.tsx:62 map cancelled to
  fulfilled, changing meaning instead of handling a variant.

## Target shape

- shared/domain contains dependency-free constants and money/address/tag
  policies used by Next, React, and Convex.
- convex/lib/validators.ts owns reusable Convex field/document validators.
- Convex Doc and Infer types are authoritative; UI/API define DTOs and view
  models as projections, never mirror database documents manually.
- MVP state unions contain only reachable, meaningful states. Every remaining
  transition has one pure policy function and one mutation owner.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Tests | npm test -- domain lifecycle money | all pass |
| Duplicate scan | rg named patterns from Done criteria | no duplicate owners |
| Codegen | npx convex codegen | exit 0 |
| Typecheck | npm run typecheck | exit 0 |
| Lint/build | npm run lint && npm run build | exit 0 |

## Scope

In scope:

- shared/domain/status.ts (create)
- shared/domain/money.ts (create)
- shared/domain/strings.ts (create)
- convex/lib/validators.ts (create)
- convex/lib/auth.ts (create)
- convex/lib/rfsDomain.ts (create)
- convex/lib/capabilities.ts (retain and retype, or fold into rfsDomain)
- convex/schema.ts
- convex/rfs.ts
- convex/skills.ts
- convex/purchases.ts
- convex/contributions.ts
- convex/users.ts
- convex/seeds.ts
- src/lib/types.ts
- src/lib/view-models.ts
- Focused tests and generated Convex bindings

Out of scope:

- Changing the payment trust boundary or payout provider
- Redesigning public HTTP response shapes; Plan 005 owns them
- Splitting every Convex file merely to reduce line count
- Adding speculative post-MVP states

## Git workflow

- Suggested branch: johann/004-domain-contracts
- Commit lifecycle migration separately from mechanical helper consolidation.
- Do not deploy a destructive schema change without the data audit in Step 1.

## Steps

### Step 1: Audit persisted state variants before removing any

Query non-sensitive counts for every RFS, skill, contribution, and legacy
payout status in the target deployment. Do not print record bodies.

The intended MVP lifecycle is:

- RFS: open -> funded -> published
- Claimant assignment is an orthogonal field while funded.
- Skill: created only when published; no draft/submitted workflow.
- Accepted payment rows are facts; rejected attempts are errors/events, not
  contribution or purchase records.

If persisted fulfilled or cancelled rows exist, define an explicit migration:
fulfilled with a skill -> published; fulfilled without a skill -> funded.
Cancelled requires a product decision and must not be silently relabeled.

Verify: a pre-migration count report is saved as test/command output without
identifying data.

### Step 2: Add dependency-free domain primitives

Create shared/domain modules with:

- canonical reachable status arrays and inferred literal types
- normalizeTags
- parse/format six-decimal base units using string and bigint arithmetic
- format display amounts without losing sub-cent precision
- normalize/validate EVM addresses
- splitPlatformFee with explicit rounding policy

No function may use Number for authoritative money conversion. UI display may
convert only after a bounded check or use formatted strings directly.

Write table-driven tests for zero, one base unit, 0.003, 0.009, too many
decimals, leading/trailing zeros, invalid signs, duplicate tags, address case,
and fee rounding.

### Step 3: Build reusable Convex validators from field definitions

Create convex/lib/validators.ts. Reuse field objects for defineTable and
v.object document validators where Convex supports it, including _id and
_creationTime only in document validators. Export Infer types only when a
domain function needs them.

Schema remains the database authority. Do not create a second schema-shaped
interface in src.

Verify:

- rg -n 'const rfsStatusValidator|const rfsDocValidator|const skillDocValidator'
  convex

Expected: each named concept has one owner in convex/lib/validators.ts.

### Step 4: Give lifecycle and fee decisions pure owners

Move transition checks, funding-threshold calculation, entitlement eligibility,
the concurrent `canSubmitRfs` helper, and fee splitting into pure helpers in
convex/lib/rfsDomain.ts or shared/domain. Mutations orchestrate database
reads/writes and call those helpers; they do not restate policy.

Remove the intermediate fulfilled patch. Either publish atomically in one
patch or introduce a real review workflow in a separate future plan; do not
keep an unobservable state.

Consolidate requireAuthedUser and get-by-ID-or-throw helpers in convex/lib.
Keep errors structured and preserve existing public error codes unless Plan
005 intentionally changes the HTTP mapping.

### Step 5: Migrate schema and callers additively

Add new validators/helpers first, switch every caller, run codegen/tests, then
remove dead status variants and duplicate functions. If deployed data requires
a migration, land and verify it before narrowing validators.

Keep public Convex function names stable unless Plan 002 already replaced them.

Verify: npx convex codegen && npm test -- domain lifecycle

Expected: codegen and all domain tests pass.

### Step 6: Remove mirrored and dead TypeScript shapes

Delete unused User, Contribution, Skill, and Purchase interfaces from
src/lib/types.ts. Replace RFSStatus and any document-like type with type-only
projections from generated Convex types or the canonical shared status type.

Keep only view-specific DTOs whose fields are deliberately narrower than a
document. Plan 006 will finish the row projection; do not make that plan depend
on a broad RFS interface.

Verify:

- rg -n 'interface (User|Contribution|Skill|Purchase)|type RfsDoc' src/lib
- npx tsc --noEmit --noUnusedLocals --noUnusedParameters

Expected: grep has no mirrored document declarations; TypeScript exits 0.

## Test plan

- shared/domain/money.test.ts: parsing, formatting, cap boundaries, fee split.
- shared/domain/strings.test.ts: tags and addresses.
- convex/lib/rfsDomain.test.ts: all permitted and rejected transitions.
- Migration test: every legacy reachable state maps explicitly; cancelled
  never maps silently.
- Existing payment/payout tests from Plans 002–003 remain green.

## Done criteria

- [x] One owner exists for each status, document validator, money conversion,
      fee split, tag normalization, address validator, and Convex auth guard.
- [x] No authoritative money path uses Number or Math.round.
- [x] Every declared state is produced or consumed by a real workflow.
- [x] cancelled is handled explicitly, never displayed as fulfilled.
- [x] Mirrored/dead src/lib document interfaces are gone.
- [x] Codegen, tests, lint, typecheck, and build pass.
- [x] Plan 004 is marked DONE.

## STOP conditions

- Production contains cancelled records and no approved migration semantics.
- A shared module cannot run in both Next and Convex without runtime-specific
  imports; split adapters but keep one pure policy owner.
- Narrowing a validator would reject live data not covered by the migration.
- A helper extraction changes public errors or money rounding unexpectedly.

## Maintenance notes

Add future states only with their transition, writer, reader, and test in the
same change. Reviewers should reject validators copied into a feature file or
DTOs that claim to be database documents.
