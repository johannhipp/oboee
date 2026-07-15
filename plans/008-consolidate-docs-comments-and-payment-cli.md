# Plan 008: Consolidate documentation, comments, and the payment CLI

> Executor instructions: Run this plan after the behavioral plans so the docs
> describe landed code. Preserve useful historical context in Git history
> rather than maintaining stale “implementation plans” as live instructions.
> Mark Plan 008 DONE only when route/doc drift tests pass.
>
> Drift check: git diff --stat 7143943..HEAD -- README.md convex/README.md docs
> public/SKILL.md src/app/docs/page.tsx src/lib/api/contract.ts src/lib/mpp.ts
> scripts/pay.sh .github/workflows/ci.yml

## Status

- Status: DONE
- Priority: P1
- Effort: M
- Risk: LOW
- Depends on: Plans 002 through 007
- Category: docs, dx, tech-debt
- Planned at: commit 7143943, reconciled with the uncommitted worktree on
  2026-07-15

## Why this matters

The repository currently has several documents presenting themselves as the
backend contract, but they describe deleted mock data, already-completed setup,
obsolete dependency versions, and conflicting testnet/mainnet/auth policies.
The in-app route list is another hand-maintained copy. Stale comments, a
hand-rolled payment script, and the concurrent browser-generated shell command
then repeat protocol details in three places.

## Current state

- README.md:22-29 says npm install and npm run dev are sufficient, although
  dynamic pages require a configured Convex deployment and auth/payment env.
- docs/backend-integration.md:3-7 says every page uses deleted mock-data.ts and
  treats src/lib/types.ts as the database contract.
- The same file’s lines 55-64 says auth is not wired; lines 147-156 references
  a deleted /api/bid demo.
- docs/implementation-plan.md:36 onward instructs readers to create the schema
  and routes that already exist; lines 129-135 pins Better Auth 1.5.3 while
  package.json pins 1.6.23.
- docs/spec.md:83 says mppx 0.4.7 while package.json uses 0.4.12. Concurrent
  code and `.env.example` now explicitly select Tempo Moderato/pathUSD, while
  `docs/agent-mainnet-e2e.md` still presents mainnet as the active runbook.
- docs/spec.md:151 says authenticated endpoints return 401 before 402, but
  current agent funding/content routes intentionally have no session auth.
- docs/pitch.md:3-14 is an unfinished raw note ending “let ppl bid on” and
  contains an unsupported 90% statistic.
- convex/README.md:1-90 is the untouched generic Convex tutorial, including a
  nonexistent messages table example.
- src/app/docs/page.tsx:7-71 manually duplicates routes, says RFS detail
  includes contributions when it does not, and omits required submit fields.
  The concurrent deletion of payout claim is intentional and should be
  represented as absence in the executable route manifest.
- public/SKILL.md and docs/agent-mainnet-e2e.md describe anonymous agent
  payments but not the one-shot entitlement rule from Plan 002.
- Concurrent `src/lib/mpp.ts` removes the stale migration banner and commented
  fee-payer duplicate. Preserve that cleanup; move remaining operational
  configuration prose to README and `.env.example`.
- Concurrent `convex/payouts.ts` replaces missing behavior with a long comment
  and `automatedPayoutsEnabled = false`; Plan 003 removes this no-op source
  placeholder after the accounting-only contract is documented.
- scripts/pay.sh duplicates curl construction at lines 24-29 and 149-157.
  Comment headings say Steps 3/4/5 while output says Steps 2/3/4
  (lines 96-147), and line 117 uses a fixed sleep instead of readiness.
- Concurrent `src/lib/payment-command.ts` adds a second command builder using
  `npx --yes mppx sign`; its tests prove shell quoting, but the runtime install,
  account, RPC, and curl contract must have one owner with the script/docs.

## Documentation ownership

After this plan:

- docs/spec.md is the product/domain contract and explicitly states MVP scope.
- src/lib/api/contract.ts from Plan 005 is the executable route contract.
- public/SKILL.md is the concise agent procedure generated or checked against
  that route contract.
- README.md is setup and orientation only.
- convex/README.md explains this repository’s Convex modules and commands.
- Historical implementation plans are removed; Git preserves them.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Contract/docs tests | npm test -- api-contract docs | all pass |
| Script syntax | bash -n scripts/pay.sh | exit 0 |
| Script help | ./scripts/pay.sh --help | exit 0, no network/payment |
| Link/path scan | rg named stale paths/versions | no stale matches |
| Full verification | npm run lint && npm run typecheck && npm test && npm run build | all pass |

## Scope

In scope:

- README.md
- convex/README.md
- docs/spec.md
- docs/backend-integration.md
- docs/implementation-plan.md
- docs/agent-mainnet-e2e.md
- docs/pitch.md
- public/SKILL.md
- src/app/docs/page.tsx
- src/lib/api/contract.ts
- scripts/pay.sh
- src/lib/payment-command.ts
- src/lib/payment-command.test.ts
- src/lib/mpp.ts
- .env.example
- .github/workflows/ci.yml if shell verification is added
- Documentation/contract tests

Out of scope:

- New product features or route behavior
- Restoring v2 runbooks/design documents
- Publishing claims or statistics without a source
- Embedding real deployment IDs, secrets, wallet addresses, or tokens

## Git workflow

- Suggested branch: johann/008-docs-cli
- Commit contract-driven docs separately from shell cleanup.
- Do not deploy or execute a paid command during ordinary documentation tests.

## Steps

### Step 1: Snapshot the landed contract

Read the final src/lib/api/contract.ts, generated route tree, package versions,
schema, payment identity semantics, and payout behavior. Write a short facts
table in the PR description or commit notes. Resolve any mismatch in code/tests
before changing docs; docs must not paper over behavior.

Verify: npm test -- api-contract

Expected: every route file is represented exactly once.

### Step 2: Make the in-app docs render the executable route contract

Export presentation-safe route metadata from src/lib/api/contract.ts and map it
in src/app/docs/page.tsx. If descriptions or example payloads do not belong in
the runtime manifest, keep one adjacent documentation map keyed by the
manifest’s stable operation ID and add an exhaustive type check.

Add a test that fails when:

- a route is absent from docs
- method/auth/MPP flags disagree
- an example omits a required field
- a protected response example contains content without entitlement/payment

### Step 3: Collapse stale documents into one current spec

Update docs/spec.md to the final domain, auth, payment, identity, payout, route,
mainnet/testnet, and dependency facts. Distinguish implemented behavior from
deferred behavior.

Delete docs/backend-integration.md and docs/implementation-plan.md after
merging any still-true rationale into the spec. Do not leave pointer files that
look like active plans. Rewrite useful pitch language into the spec/README and
delete docs/pitch.md; remove unsupported statistics.

Verify:

- rg -n 'mock-data|api/bid|better-auth.*1\\.5\\.3|mppx 0\\.4\\.7|ppl bid|90%'
  README.md docs convex/README.md public/SKILL.md

Expected: no matches.

### Step 4: Make README files operational

README.md must include:

- prerequisites
- npm install
- Convex development/configuration command
- required environment categories with a pointer to .env.example
- npm run dev
- lint/typecheck/test/build commands
- a warning that paid smoke tests move funds and are never part of normal CI

Replace convex/README.md with a module map for auth, marketplace/RFS, payment
ingress, payouts, users, seeds, schema, generated files, and codegen/test
commands. Explain which functions are public, authenticated, signed-server
ingress, or internal.

### Step 5: Align the agent guide and Moderato smoke plan

Keep public/SKILL.md concise and executable:

- exact discovery/fund/content routes and body shapes
- amount cap and decimal/base-unit distinction
- first 402 then payment-aware retry
- persistent Better Auth grants versus one-shot anonymous payments
- safe idempotency/retry behavior
- no secret/private-key instructions

Rename or replace `docs/agent-mainnet-e2e.md` with a Tempo Moderato smoke plan
from the same operation IDs. Include explicit preconditions, confirmation
prompts, expected persisted facts, and cleanup/reconciliation. Mainnet belongs
in a clearly deferred production-readiness section, not the current command.
CI must never execute either testnet or mainnet payments.

Add a test or generator check so route method/path changes cannot drift between
the manifest, in-app docs, and SKILL.md.

### Step 6: Remove stale comments and keep invariants

Confirm the concurrent removal of `src/lib/mpp.ts`’s migration banner and
commented-out fee-payer example. Keep short comments only where they explain a
non-obvious invariant that code cannot express, such as why configuration is
lazy. Keep environment instructions in `.env.example`/README, not source.

Remove no-op source placeholders such as `automatedPayoutsEnabled = false`
after their scope is represented in the spec and route-contract test.

Do not remove standard generated/configuration comments from next-env.d.ts,
Convex generated files, or tsconfig merely to reduce comment count.

### Step 7: Prefer the installed mppx CLI over protocol duplication

First inspect the installed mppx CLI help for method, body, account, and
non-interactive support. Reconcile it with concurrent
`buildTempoPaymentCommand`. If the installed CLI covers both current examples,
make the TypeScript builder the tested command owner and replace `pay.sh` with
a thin validated wrapper or document direct pinned mppx usage.

Do not retain `npx --yes` as an implicit latest-version installer in a payment
command. Invoke the repository-pinned binary or an explicitly documented
version so a copied command cannot change semantics between review and use.

If a custom script remains necessary:

- implement --help and validate METHOD/URL/BODY
- check tempo, curl, jq, base64, and bc before any request
- use one request function/argument array for initial and credential retries
- number displayed steps from one source
- replace fixed sleep with bounded transaction/readiness polling
- preserve response body/status without echo/sed pipelines that corrupt data
- confirm amount, currency, recipient, and network before transfer
- support a dry-run/challenge-inspection mode that never pays

No test may execute a transfer. Add bash -n and help/dry-run checks to CI.

Verify:

1. bash -n scripts/pay.sh
2. ./scripts/pay.sh --help
3. ./scripts/pay.sh --dry-run with a fixture 402 server, if the script remains

Expected: all exit 0; no wallet transfer occurs.

### Step 8: Run the complete drift suite

Run:

1. npm run lint
2. npm run typecheck
3. npm test
4. npm run build
5. bash -n scripts/pay.sh, if the script remains
6. The stale-string grep from Step 3

Expected: all pass/no stale matches.

## Done criteria

- [x] One current product spec and one executable route manifest exist.
- [x] In-app docs and agent docs are checked against the manifest.
- [x] Stale implementation plans and unfinished pitch notes are removed.
- [x] README local setup includes Convex, env, and verification steps.
- [x] Convex README describes this repository rather than a tutorial example.
- [x] Agent docs state honest anonymous entitlement and payment behavior.
- [x] Stale migration comments and duplicated fee-payer example are gone.
- [x] Payment CLI uses mppx directly or has one composable request/polling path.
- [x] No automated test moves money.
- [x] Lint, typecheck, tests, build, and shell checks pass.
- [x] Plan 008 is marked DONE.

## STOP conditions

- Landed code still disagrees with the API manifest or spec; return to the
  owning behavioral plan instead of documenting a contradiction.
- A real mainnet payment is required to make a docs test pass.
- The installed mppx CLI cannot express the flow and a custom script would need
  to store/expose a private key.
- A document contains operational history that must be retained for compliance;
  move it to a clearly labeled archive with an owner/date, not a live plan.

## Maintenance notes

Contract tests, not prose discipline, prevent future drift. Reviewers should
reject version numbers copied into prose when they can be read from package
metadata, duplicated route arrays, comments that narrate obsolete migrations,
and shell code that reimplements an installed payment client without a proven
gap.
