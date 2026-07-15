# Plan 001: Restore a regression-test harness

> Executor instructions: Follow this plan step by step. Run every verification
> command before moving on. If a STOP condition occurs, report it rather than
> improvising. When done, mark Plan 001 DONE in plans/README.md.
>
> Drift check: git diff --stat 7143943..HEAD -- package.json package-lock.json
> .github/workflows/ci.yml vitest.config.ts src convex

## Status

- Status: DONE
- Priority: P1
- Effort: M
- Risk: LOW
- Depends on: none
- Category: tests, dx
- Planned at: commit 7143943, reconciled with the uncommitted worktree on
  2026-07-15

## Why this matters

The reset deleted every unit, integration, and browser test along with the test
runner. At the clean baseline, lint, typecheck, and build all passed while paid
content was publicly readable and bigint routes were broken, demonstrating
that those checks could not protect behavior. Concurrent work now restores a
useful unit/server harness; this plan finishes its ownership and CI contract
without restoring the deleted v2 suite.

## Current state

- The clean commit had no tests or runner. Concurrent work now adds Vitest,
  convex-test, ten test files, and `vitest.config.ts` without committing them.
- `npm test` currently collects 27 tests and all pass. The Plan 002 paywall
  cases that initially failed are now green and must remain in the default
  suite.
- package.json concurrently adds Playwright, axe, and `test:e2e`, but there is
  no Playwright configuration or e2e test. This is an incomplete harness, not
  a passing verification layer.
- .github/workflows/ci.yml:23-33 installs, lints, typechecks, and builds only.
- The concurrent work mixes harness files with production changes from Plans
  002, 003, 005, and 007. Split commits by plan without discarding any file.
- The prior commit contains useful Convex-test syntax, but not a contract to
  restore. Inspect it only as a pattern:
  git show 7143943^:convex/skills.test.ts

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Install | npm install | exit 0 |
| Unit tests | npm test | exit 0 |
| Typecheck | npm run typecheck | exit 0 |
| Lint | npm run lint | exit 0 |
| Build | npm run build | exit 0 |

## Scope

In scope:

- package.json
- package-lock.json
- vitest.config.ts (create)
- .github/workflows/ci.yml
- src/app/api/_lib/responses.test.ts (create)
- convex/schema.test.ts (create)
- Any single test helper under test/ required by those two tests
- Existing concurrent test files/configuration, to classify under the owning
  plan rather than recreate

Out of scope:

- Reintroducing the deleted v2 tests or Playwright suite
- Fixing the paywall, payout, API, or UI findings; later plans own them
- Changing production behavior to make a test pass

## Git workflow

- Suggested branch: johann/001-regression-harness
- Use conventional commits; example: test: restore MVP regression harness
- Do not push or open a pull request unless instructed.

## Steps

### Step 1: Reconcile the concurrent Vitest setup

Inspect the uncommitted package/config/lock changes first. Retain compatible
current versions of Vitest and convex-test and ensure the scripts are:

- test: vitest run
- test:watch: vitest

Keep `vitest.config.ts` on the Node environment with the existing `@` alias and
include patterns for `src/**/*.test.ts` and `convex/**/*.test.ts`. Do not add
jsdom or React Testing Library yet; the first tests exercise pure/server code.

Remove Playwright, axe, and `test:e2e` in this plan unless a real configuration
and smoke test land together under Plan 007. A script that always fails because
its suite does not exist is not a harness.

Verify: npm test -- --passWithNoTests

Expected: exit 0 and Vitest starts successfully with all collected tests green.

### Step 2: Prove route-response tests work

Create src/app/api/_lib/responses.test.ts. Cover:

- okWriteResponse emits the documented status/resource fields.
- errorResponse emits the documented error shape and status.
- errorResponseFrom maps UNAUTHORIZED, NOT_FOUND, FORBIDDEN, INVALID_STATE,
  and INVALID_* to the current HTTP status policy.
- Unknown errors do not expose stack traces.

Do not lock in the current raw internal-error message leakage; assert only the
public generic shape for an unknown Error.

Verify: npm test -- src/app/api/_lib/responses.test.ts

Expected: all response tests pass.

### Step 3: Prove Convex-test can load the current schema

Create convex/schema.test.ts using convex-test with convex/schema.ts and the
repository modules. Add a smoke test that inserts a minimal RFS through the
test database and reads it back, proving bigint and indexes load. Keep this
test independent of Better Auth and payment flows.

If import.meta.glob is required, isolate it in a test helper and document why.
Do not weaken the production schema.

Verify: npm test -- convex/schema.test.ts

Expected: the schema smoke test passes without network access.

### Step 4: Put tests in CI before build

Add an npm test step after typecheck and before build in
.github/workflows/ci.yml. Keep the existing Node 24 and npm ci setup.

Verify:

1. npm ci
2. npm run lint
3. npm run typecheck
4. npm test
5. npm run build

Expected: every command exits 0.

Do not weaken the test command to exclude the security suite. If later stacked
changes make it red, finish the owning plan before enabling or merging the CI
step.

## Test plan

This plan formalizes the concurrent runner and its ten passing suites, plus a
dedicated schema smoke test if the existing payment fixtures are not a clear
enough schema-load contract. Later plans must add regression cases to the
nearest domain/route suite instead of creating ad-hoc scripts.

## Done criteria

- [x] package.json has test and test:watch scripts.
- [x] npm test runs at least the response and schema suites.
- [x] CI runs npm test before npm run build.
- [x] npm ci, lint, typecheck, test, and build all exit 0.
- [x] The harness commit is separable from production behavior changes; tests
      for later plans remain in their owning commits or a clearly ordered
      stacked series.
- [x] Plan 001 is marked DONE in plans/README.md.

## STOP conditions

- The installed Convex version is incompatible with the current convex-test
  release and cannot load the schema after two focused attempts.
- The test runner requires a live Convex deployment or production credential.
- A passing smoke test would require changing production behavior.
- In-scope files drift again after reconciliation in a way that cannot be
  separated without discarding user-owned work.

## Maintenance notes

Keep this harness fast and network-free. Add Playwright only when Plan 007 has
a real browser payment path worth exercising. Reviewers should reject skipped
security tests or test commands that silently pass with zero collected tests.
