# Plan 005: Compose consistent HTTP API boundaries

> Executor instructions: Read the repository’s installed Next.js 16 route
> handler guide before changing signatures:
> node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md.
> Keep params asynchronous and use the documented RouteContext type. Mark Plan
> 005 DONE after the route-inventory tests and full build pass.
>
> Drift check: git diff --stat 7143943..HEAD -- src/app/api src/lib/auth-server.ts
> src/lib/mpp.ts package.json

## Status

- Status: DONE
- Priority: P1
- Effort: M
- Risk: MED
- Depends on: Plans 001 and 004
- Category: bug, tech-debt, architecture
- Planned at: commit 7143943, reconciled with the uncommitted worktree on
  2026-07-15

## Why this matters

At the clean baseline, each route invented its own parsing, ID cast, auth
check, bigint serialization, payment credential extraction, and response
assembly. Concurrent work fixes the immediate ID, bigint, tag, and ambiguous
lookup bugs, but its helpers remain incremental rather than one typed HTTP
contract. This plan completes that consolidation without undoing the fixes.

## Current state

- Concurrent detail routes now use tested `toJsonSafe`, so bigint values no
  longer crash native Response.json. They still serialize entire returned
  objects rather than explicit public DTOs.
- Concurrent work removes the skill-to-RFS exception fallback. Preserve that
  resource-specific behavior.
- `src/lib/json.ts` is now the shared recursive bigint converter. It is a useful
  final safety net, not the public field-selection contract.
- Native proof at planning time:
  node -e 'Response.json({amount: 1n})'
  throws TypeError: Do not know how to serialize a BigInt.
- parseBaseUnits is duplicated in rfs/route.ts:6-17 and
  rfs/[id]/submit/route.ts:9-20.
- Concurrent `src/app/api/_lib/payment.ts` centralizes credential extraction,
  but route-specific amount parsing/formatting and unsafe payload casts remain.
- Concurrent route edits remove the eight `as Id` assertions and normalize
  strings inside Convex. The normalization pattern is repeated across several
  public functions and should call one boundary helper rather than regress to
  route casts.
- skills/route.ts:32-38 mishandles one comma-separated tags parameter because
  getAll("tags") is non-empty before CSV splitting.
- Concurrent work deletes the false payout-claim route. Keep it absent under
  Plan 003’s accounting-only contract.
- isAuthenticated plus the same 401 response is repeated across authenticated
  routes.
- `getToken` now has callers; `preloadAuthQuery` and `fetchAuthAction` still
  need a usage check before removal.
- Concurrent `responses.ts` adds wrapped-Convex parsing and more status cases,
  but still uses an if-chain over arbitrary strings, has no correlation ID,
  and cannot type resource-specific success extras.

## Target shape

- HTTP request parsers return Result-like success/error values and are the only
  place raw unknown input is inspected.
- Convex IDs are normalized inside Convex from strings; HTTP code does not lie
  to TypeScript with branded-ID casts.
- DTO builders explicitly turn bigint base units into decimal strings before
  JSON serialization.
- One typed response builder owns success/error envelopes and optional fields.
- One payment credential adapter extracts verified facts for both paid routes.
- Resource routes are explicit: skill IDs go to skill routes; RFS IDs go to RFS
  routes. No exception-driven polymorphic lookup remains.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Route tests | npm test -- api-route | all pass |
| Route inventory | find src/app/api -name route.ts | matches contract fixture |
| Typecheck | npm run typecheck | exit 0 |
| Lint | npm run lint | exit 0 |
| Build | npm run build | exit 0 and same intended route set |

## Scope

In scope:

- src/app/api/**/*.ts
- src/lib/api/http.ts (create)
- src/lib/api/parsers.ts (create)
- src/lib/api/payment.ts or src/app/api/_lib/payment.ts (choose one canonical
  location; do not keep both)
- src/lib/api/dto.ts (create)
- src/lib/api/contract.ts (create)
- src/lib/auth-server.ts
- Convex string-ID boundary wrappers required by routes
- Focused tests
- Existing concurrent `src/app/api/_lib/payment.ts` and response tests, to move
  or retain as the canonical adapter rather than duplicate

Out of scope:

- Changing payment verification or payout state machines
- Adding a new API version
- Restoring OpenAPI/v2 infrastructure
- Adding a validation dependency unless the pure parsers cannot express a
  required contract without duplication

## Git workflow

- Suggested branch: johann/005-http-boundaries
- Add helpers/tests first, switch one route family at a time, then remove old
  helpers. Keep every commit buildable.

## Steps

### Step 1: Write failing contract tests for the known boundary bugs

Cover:

- RFS detail containing bigint serializes with base-unit strings and status 200.
- Skill detail does the same and never includes paid content.
- A backend error in skill lookup is surfaced once, not retried as an RFS.
- Invalid/mismatched IDs produce a structured 400 or 404, never an assertion.
- tags=a,b and tags=a&tags=b normalize to the same tag list.
- Success responses can carry claimed amount, access, purchase, and receipt
  fields without response round-tripping.
- Unknown errors return a generic public message and a correlation ID; internal
  stack/error text is not returned.

The bigint, tags, ID, and fallback cases are already fixed by concurrent tests.
Keep them green and first demonstrate failures only for missing explicit DTOs,
typed success extras, auth/error ownership, and route inventory.

### Step 2: Create canonical parsers and DTO mappers

Implement dependency-free parsers for:

- JSON object bodies with required string/string-array fields
- positive integer base-unit strings
- six-decimal payment amounts from Plan 004
- query status/search/tags/author fields
- non-empty idempotency keys

DTO mappers must select public fields explicitly and serialize all base-unit
values as strings. Do not rely on a recursive JSON walker as the domain
contract; a generic bigint replacer may exist only as a final assertion/safety
net that tests fail if a mapper is missing.

### Step 3: Normalize external IDs inside Convex

Change route-facing Convex operations to accept external ID strings and call
ctx.db.normalizeId for the expected table before invoking typed domain helpers.
Return a structured INVALID_ID or NOT_FOUND error. Keep branded Id values after
that boundary.

Remove route-level as Id assertions. Do not guess Convex’s opaque ID format
with a regex.

The concurrent work already performs this cutover in the touched functions.
Extract the repeated normalize-or-NOT_FOUND mechanics only if a small typed
helper preserves the expected table type; do not add a `getPublic = get` alias
solely to expose the same implementation twice.

Verify: rg -n 'as Id<' src/app/api

Expected: no matches.

### Step 4: Build typed response and auth adapters

Replace responses.ts with builders that accept a typed payload:

- ok(resourceType, resourceId, nextState, extras?, status?)
- problem(code, message, status, correlationId?)
- fromConvexError(error)

Use an exhaustive error-code-to-status map based on Plan 004’s canonical
codes. Log unknown errors server-side with a correlation ID and return a
generic message.

Add a small requireAuthenticatedRoute helper only for the repeated 401 gate.
Do not create a route factory that hides each handler’s parsing and domain
call. Remove unused auth-server exports after confirming no callers.

### Step 5: Extract verified payment facts once

Move or retain challenge amount, currency, challenge ID, and receipt-reference
extraction in one canonical payment adapter. The concurrent
`src/app/api/_lib/payment.ts` is the starting point; do not create
`src/lib/api/payment.ts` beside it. Accept a Credential only after mppx has
verified the request. Return a discriminated parse error instead of relying on
unchecked object casts.

Both funding and content routes call this adapter and the signed ingress from
Plan 002. Price/minimum policy remains in the domain layer.

Verify: rg -n 'credential\\.challenge\\.request|credential\\.payload as'
src/app/api

Expected: only src/lib/api/payment.ts matches.

### Step 6: Make routes resource-specific and switch incrementally

- GET /api/skills/[id] accepts only a skill ID.
- GET /api/rfs/[id] becomes the explicit RFS detail route with the auth policy
  chosen in the canonical spec.
- Remove catch-and-retry lookup.
- Switch catalog, create, claim, submit, fund, content, wallet, and payout
  routes to shared parsers/DTOs/responses.
- Use RouteContext<"/api/..."> where Next 16 generates it.

After each route family, run its focused tests and typecheck.

### Step 7: Add a route/contract inventory test

Define the intended method, path, auth, MPP, and resource kind once in
src/lib/api/contract.ts. Add a test that scans route.ts files and fails when a
route is missing from the manifest or the manifest names no file. Plan 008
will render docs from this contract.

Verify: npm test -- api-route && npm run lint && npm run typecheck && npm run build

Expected: all pass; build lists the same intentional routes.

## Done criteria

- [x] No route asserts a raw string as a Convex Id.
- [x] Every bigint is converted by an explicit DTO mapper.
- [x] Skill/RFS lookup is resource-specific and never exception-driven.
- [x] Request parsing, response envelopes, auth gating, and payment extraction
      each have one owner.
- [x] All actual API routes are represented in the contract manifest.
- [x] Route tests, full tests, lint, typecheck, and build pass.
- [x] Plan 005 is marked DONE.

## STOP conditions

- The installed Next guide disagrees with RouteContext or params assumptions.
- An existing external client depends on /api/skills/[id] accepting RFS IDs;
  report the compatibility need before adding a redirect/alias.
- A DTO requires exposing content or a server-only payment field.
- Normalizing IDs inside Convex would require weakening all internal typed
  helpers to string.

## Maintenance notes

Keep route handlers explicit and boring: parse, authorize, call, map, respond.
Shared helpers should remove repeated mechanics, not hide business workflows.
Any new route must update the contract inventory and add a boundary test in the
same change.
