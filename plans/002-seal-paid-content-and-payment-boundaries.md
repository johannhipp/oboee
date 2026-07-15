# Plan 002: Seal paid content and payment-write boundaries

> Executor instructions: Follow this plan in order and run every verification.
> Do not expose a new public Convex function unless its authorization is
> explicit and tested. Mark Plan 002 DONE in plans/README.md when complete.
>
> Drift check: git diff --stat 7143943..HEAD -- convex/schema.ts
> convex/skills.ts convex/purchases.ts convex/contributions.ts convex/seeds.ts
> src/app/api/rfs/[id]/fund/route.ts
> src/app/api/skills/[id]/content/route.ts shared src/lib

## Status

- Status: DONE
- Priority: P1
- Effort: L
- Risk: HIGH
- Depends on: Plan 001
- Category: security, bug, architecture
- Planned at: commit 7143943, reconciled with the uncommitted worktree on
  2026-07-15

## Why this matters

The payment gate currently protects only the Next route. The same full skill
document is returned by public Convex queries, and the database mutations that
record a paid contribution or purchase accept caller-supplied challenge,
receipt, amount, and currency without an authenticated server proof. A caller
can therefore read paid content or manufacture funding and purchases without
paying.

## Current state

- At clean commit 7143943, `convex/skills.ts` and `convex/purchases.ts` returned
  full skill documents from public queries even when access was false.
- Concurrent `convex/lib/skillMetadata.ts`, metadata projections, and
  `readEntitledContent` now separate public metadata from protected Markdown.
  The browse preview uses summary rather than slicing paid content.
- convex/contributions.ts:14-29 and convex/purchases.ts:24-40 export public
  mutations. Anonymous callers receive an agent ID derived from a challenge
  string supplied by the caller.
- src/app/api/rfs/[id]/fund/route.ts:62-103 and
  src/app/api/skills/[id]/content/route.ts:49-105 verify MPP before calling
  those public mutations, but direct Convex callers bypass Next.
- convex/seeds.ts:7 and 146 export unrestricted data-writing mutations.
- accessGrants stores userId strings, but anonymous IDs are challenge-specific;
  convex/purchases.ts:130-146 can resolve grants only for a Better Auth user.
- paymentEvents has a challenge index, but replay checks currently query the
  contributions and purchases tables separately.
- Concurrent work adds `convex/lib/paymentBoundary.ts` and passes a long-lived
  `serverSecret` as a public mutation argument. Constant-time comparison is an
  improvement over the clean baseline, but the bearer secret and adjacent
  principal/payment facts still cross a public function boundary and may be
  exposed through invocation tooling or logs.
- Concurrent replay handling is idempotent within each source table, not
  globally across funding and purchase operations.
- Concurrent `resolvePaymentPrincipal` still synthesizes
  `agent:<challenge-prefix>` and can persist a grant with no stable returning
  principal.
- Concurrent seed protection reuses `assertServerSecret`, but seed mutations
  remain public bearer-secret functions and the supposedly generic helper
  hard-codes `PAYMENT_UNAVAILABLE` when the seed secret is absent.
- `convex/payments.test.ts` captures the paywall and one-shot-content contract.
  At final reconciliation, all 27 repository tests pass. Those cases are the
  acceptance floor for the remaining ingress changes.

## Target boundary

Use three distinct surfaces:

1. Public metadata queries: never return contentMarkdown.
2. Authenticated entitlement query: may return content only to a Better Auth
   user who is the author or has a grant.
3. Verified-payment command: Next verifies MPP, signs a short-lived canonical
   command with a server secret, and the Convex ingress verifies that signature
   before atomically recording payment and returning the one-shot paid result.

Anonymous MPP payments are one-shot in the MVP. They do not create a reusable
access grant because the current receipt does not provide a stable payer
principal. Persistent backer/purchase grants remain a Better Auth user feature.
Document this explicitly rather than creating unusable agent:<challenge> IDs.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Focused tests | npm test -- payment-boundary | all pass |
| Full tests | npm test | all pass |
| Convex codegen | npx convex codegen | exit 0 |
| Typecheck | npm run typecheck | exit 0 |
| Lint | npm run lint | exit 0 |
| Build | npm run build | exit 0 |

## Scope

In scope:

- convex/schema.ts
- convex/skills.ts
- convex/purchases.ts
- convex/contributions.ts
- convex/seeds.ts
- convex/paymentIngress.ts (create)
- convex/lib/serverCommand.ts (create)
- convex/lib/paymentBoundary.ts (replace/remove after cutover)
- shared/server-command.ts (create)
- src/lib/server-command.ts (create)
- src/app/api/rfs/[id]/fund/route.ts
- src/app/api/skills/[id]/content/route.ts
- .env.example
- Focused tests for these files
- Regenerated convex/_generated files

Out of scope:

- Restoring v2 principals, delegations, or policy APIs
- Creating durable anonymous-agent identity
- Changing price caps or payout settlement
- Hand-editing generated Convex bindings

## Git workflow

- Suggested branch: johann/002-payment-boundary
- Commit in two reviewable units: regression tests, then boundary repair.
- Do not push or deploy without instruction.

## Steps

### Step 1: Capture the bypasses as failing tests

Add tests that call Convex functions directly, not only through Next:

- An unauthenticated metadata query result never owns contentMarkdown.
- An unauthenticated entitlement query returns no content.
- An unsigned or expired contribution command is rejected.
- An unsigned or expired purchase command is rejected.
- Reusing a challenge ID across payment operation types is rejected globally.
- Production-mode code cannot invoke seed writes through the public API.

The concurrent suite already confirms the metadata and one-shot cases pass.
Add the remaining unsigned, expiry, cross-operation replay, and seed-boundary
cases without removing or weakening those tests.

Verify: npm test -- payment-boundary

Expected before the ingress implementation: only the newly added unsigned,
expiry, global-replay, and public-seed cases fail for their intended reason.

### Step 2: Preserve and finish the public/protected content split

Retain concurrent `skillMetadataValidator`/`toSkillMetadata`, which contain
IDs, summary, tags, price, status, and timestamps but never contentMarkdown.
Move their duplicated status validator into Plan 004’s canonical validator
module rather than reintroducing a full skill document at either call site.

Keep the two focused operations now introduced around purchases.checkAccess:

- A public/auth-aware entitlement summary that returns hasAccess and metadata.
- An authenticated content query that returns content only for the author or a
  persisted Better Auth user grant.

Update the browse detail projection to use metadata for its preview. Do not
show a substring of paid content to an unentitled caller.

Verify: rg -n "contentMarkdown" convex/skills.ts

Expected: contentMarkdown appears only in a protected write/helper path, not a
public query return validator.

### Step 3: Add a signed server-command envelope

Create shared/server-command.ts as a runtime-neutral definition of a
discriminated command:

- operation: fund or purchase
- resource ID
- amount base units as a decimal string
- normalized currency
- challenge ID
- verified receipt reference
- issued-at and expiry
- random nonce

Canonicalize fields in a fixed order; never sign JSON object insertion order.
Use HMAC-SHA256 with a new OBOE_SERVER_COMMAND_SECRET present in both the Next
and Convex server environments. Keep signing in src/lib/server-command.ts and
verification in convex/lib/serverCommand.ts. Compare signatures in constant
time, enforce a short expiry, and reject malformed fields before business
logic.

The production secret must never use a `NEXT_PUBLIC_` name or appear in tests,
logs, responses, or plan files. Tests use an injected dummy value.

Remove the raw `serverSecret` mutation argument after the signed envelope is
live. Passing a long-lived bearer secret beside mutable facts is not the target
boundary, even when the comparison itself is constant-time.

Verify: npm test -- server-command

Expected: valid, tampered, expired, wrong-operation, and wrong-resource cases
all pass.

### Step 4: Make one verified payment ingress the write owner

Create convex/paymentIngress.ts with the only public payment mutation. It must
verify the signed command first, check paymentEvents.by_challengeId for global
replay, and then atomically perform the existing domain write.

Move contribution and purchase database changes into non-exported helpers or
internal mutations. Remove the public recordContribution and recordPurchase
exports. For a paid purchase, return the purchased content in the signed
command result so the Next route does not perform a second public content read.

Validate purchase amount against the effective listed price and currency
against the configured token inside Convex as well as in Next. Do not trust
the signed command to bypass domain invariants.

Verify:

- rg -n "export const record(Contribution|Purchase)" convex
- npm test -- payment-boundary

Expected: the grep has no matches; all boundary tests pass.

### Step 5: Encode honest anonymous-payment semantics

Stop creating agent IDs from challenge fragments. Store an anonymous payment
reference separately from an optional authenticated backer/buyer user ID.
Create accessGrants only when a stable Better Auth user exists. The paid route
still returns content on the verified retry, but a later anonymous request is
not falsely reported as entitled.

Update listContributions and dashboard DTOs so callers handle user and
anonymous-payment contributors explicitly, without pretending the receipt is
a user ID.

Delete `resolvePaymentPrincipal` and every `agent:<challenge>` fallback after
all callers use the explicit authenticated-or-one-shot result model.

Verify: rg -n 'agent:.*challenge|slice\(0, 18\)' convex src

Expected: no matches.

### Step 6: Remove public seed writes

Convert seed mutations to internalMutation or move fixture data behind an
explicit development-only command that fails closed unless a non-production
environment flag is set. listSeededRfs may remain public only if its metadata
is intentionally public and contains no protected content.

The concurrent `OBOE_SEED_SECRET` check is a useful regression test, not the
target public API. Remove the secret argument and the seed-specific branch from
the generic payment-secret helper when the internal/development command owns
the operation.

Verify the generated public API type has no seedCveDataset or
publishFundedSeedRfs reference under api.seeds.

### Step 7: Switch both Next payment routes

After mppx has verified the credential, build and sign the canonical command,
then call paymentIngress. Remove duplicated follow-up content reads. Preserve
the HTTP 402 behavior and Payment-Receipt handling supplied by mppx.

Never return the signed envelope or its signature to the browser.

Verify: npm test && npm run lint && npm run typecheck && npm run build

Expected: all exit 0.

## Done criteria

- [x] No public Convex query returns contentMarkdown without entitlement.
- [x] No unsigned public Convex mutation can record a payment.
- [x] Replay protection is global across fund and purchase operations.
- [x] Anonymous payments do not create fake reusable user grants.
- [x] Seed writes are absent from the production public API.
- [x] Direct-Convex bypass tests and normal paid-route tests pass.
- [x] Codegen, lint, typecheck, tests, and build pass.
- [x] Plan 002 is marked DONE.

## STOP conditions

- The Convex runtime cannot verify the chosen HMAC construction. Do not replace
  it with an unhashed shared token; report and select a server-only transport.
- mppx does not provide a verified receipt reference to the handler.
- Closing the bypass requires exposing a deployment admin key to the browser.
- Existing anonymous grants must be preserved as durable identities; that
  requires a product decision and a separate migration.
- The production deployment has callers that directly invoke the old payment
  mutations and cannot be migrated atomically.

## Maintenance notes

The trusted command is a boundary adapter, not a second payment verifier. MPP
remains authoritative for settlement proof; the envelope proves only that the
trusted Next verifier produced the command. Reviewers should scrutinize
canonicalization, expiry, replay checks, and any public return containing
content.
