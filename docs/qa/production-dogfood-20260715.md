# Oboe production dogfood and MPP endpoint audit

| Field | Value |
|---|---|
| Date started | 2026-07-15 |
| Target | https://www.oboe.sh |
| Branch | `johann/deploy-policy-v2` |
| Convex deployment | `different-clownfish-198` (`oboe-v2` production) |
| Scope | Public web app, v2 API, authentication boundaries, guarded workflows, negative cases, and user-story coverage |
| Evidence log | [`../../.audit/production-dogfood-20260715.tsv`](../../.audit/production-dogfood-20260715.tsv) |

## Purpose and completion bar

This is an ongoing, append-only QA record for the production-readiness pass. It
uses the agent-first user stories as a requirements index, but treats observed
production behavior and the current OpenAPI contract as authoritative when the
stories are stale.

The pass is not complete until every reachable P0 journey has either been
verified end-to-end or has a documented external prerequisite, every public
endpoint has a positive and negative check, guarded endpoints have structured
auth/role/error checks, and every discovered product bug has a focused fix,
regression test, individual commit, and live verification.

## Current status

| Severity | Open | Fixed and verified |
|---|---:|---:|
| Critical | 0 | 0 |
| High | 0 | 3 |
| Medium | 0 | 10 |
| Low | 0 | 2 |
| **Total** | **0** | **15** |

The prior high-severity detail-page failure is recorded below as fixed. New
findings are added immediately with reproduction evidence and a commit link.

## Test matrix

| Area | User-story references | Evidence target | Status |
|---|---|---|---|
| Machine contract and discovery | A-ID-01, A-DIS-01..05, H-DIS-01..09 | agent guide, OpenAPI, catalog, filters, deep links, exact versions | pass for public surfaces |
| Public MPP reads | A-API-01, A-API-03..04 | every public GET, malformed IDs, pagination, stable error envelopes | pass |
| Auth/session boundary | A-ID-02..06, H-OWN-01 | sign-in/session behavior, 401/403 distinction, guarded UI | negative pass; live identity blocked |
| Wallets, keys, delegations | A-ID-04..05, H-OWN-02..03 | challenge/proof flows, revocation, permission checks | local pass; live identity blocked |
| Purchase and content | A-USE-01..06 | exact-version intent, idempotency, quarantine, access, install | negative/local pass; money gates off |
| RFS lifecycle | A-RFS-01..10, A-FUL-01..10 | validation, funding, race/idempotency, application, submission | negative/local pass; money gates off |
| Evaluation and evidence | A-EVAL-01..12, H-REV-01..07 | eligibility, fixtures, evidence ACL, corrections, harm/dispute | negative/local pass; live identity blocked |
| Settlement and operations | A-MON-01..06 | obligations, holds, recovery, ops role boundaries | negative/local pass; live identity blocked |

## Baseline environment

- The branch was clean at `d96e71f` before this pass; no pull request existed.
- Production policy-v2 feature activation and money writes remain disabled while
  the guarded workflows are verified.
- `agent-browser` is not installed in this environment, so the dogfood browser
  evidence uses the installed `browser-use` CLI as a documented fallback.
- No Oboe user credentials or wallet secrets are assumed. Authenticated tests
  use repository fixtures/local Convex tests unless the user supplies a live
  login session.
- Convex production push completed to `different-clownfish-198` on 2026-07-15.
- Vercel production deployment `dpl_CSuZE9Qmk226ZbjiwbUbvohVezmj` reached
  `READY` and was aliased to `https://www.oboe.sh`; the build completed with
  Next.js 16.2.10 and the current branch source.

## Findings

### ISSUE-001: Imported skill deep links showed “local data unavailable”

| Field | Value |
|---|---|
| Severity | high — fixed |
| Category | functional / data contract |
| First observed | 2026-07-14 |
| Production URL | https://www.oboe.sh/browse/k171xnt1qhqhgpztssg7e8pb858362jb |
| Fix commit | [`d96e71f`](https://github.com/t3nsed/oboee/commit/d96e71f) |
| Verification | HTTP 200 page/API checks on 2026-07-15; page renders the real skill and read-only policy-v1 notice |

**Reproduction before the fix**

1. Open the published skill deep link while signed out.
2. Observe `LOCAL DATA UNAVAILABLE` and `Convex is not reachable from this environment.`
3. The catalog simultaneously advertised the same record, creating a broken
   catalog-to-detail path.

**Root cause and fix**

Migrated records are intentionally policy-v1 and carry `legacyImported: true`,
but the discovery projection exposed them while `skills.getPublic` rejected
every skill whose row was not policy-v2. The fix validates the linked
skill/version pair, preserves the source policy version, keeps discovery
projections consistent, and denies purchase capabilities for imported records.

**Current evidence**

- `GET /api/v2/skills/k171xnt1qhqhgpztssg7e8pb858362jb` → 200.
- `GET /api/v2/skills/k171xnt1qhqhgpztssg7e8pb858362jb/versions/th7fqkmph2ekwd61s107psa2h98ah1cm` → 200.
- `GET /api/v2/catalog` → 200 with two real records and denied purchase
  capabilities for both imported records.
- The browser page renders `CVE chain playbook: ingress-to-runtime
  containment` and `Imported policy-v1 content`.

### ISSUE-002: Agent guide advertises an MPP token address with a trailing newline

| Field | Value |
|---|---|
| Severity | medium — fixed and verified |
| Category | functional / API contract |
| First observed | 2026-07-15 |
| Production URL | https://www.oboe.sh/.well-known/oboe-agent.json |
| Evidence | [`issue-002-agent-guide.png`](production-20260715/screenshots/issue-002-agent-guide.png) and the raw response below |
| Fix commit | [`8c6cb9d`](https://github.com/t3nsed/oboee/commit/8c6cb9d) |
| Expected | `payments.token` is a normalized nonzero EVM address with no control characters |
| Actual | The JSON string ends with `\\n`: `0x20c000000000000000000000b9537d11c60e8b50\\n` |

**Reproduction**

```sh
curl -fsSL https://www.oboe.sh/.well-known/oboe-agent.json \
  | jq -r '.payments.token' | od -An -t x1
# ... 35 30 0a  (the final byte is the pipe's line ending; the JSON value itself
# contains an escaped LF before jq prints it)

curl -fsSL https://www.oboe.sh/.well-known/oboe-agent.json \
  | jq -c '[.payments.token, (.payments.token | length), (.payments.token | test("\\\\n$"))]'
# ["0x20c000000000000000000000b9537d11c60e8b50\\n",43,true]
```

The manifest is public machine-readable configuration, so an agent that uses
the advertised token verbatim can fail address validation or construct an
invalid payment request. The live MPP adapter already trims its own runtime
configuration, which narrows this finding to the public contract boundary.

**Root cause and fix**

`src/app/.well-known/oboe-agent.json/route.ts` serializes the raw
`MPP_FUNDING_TOKEN_ADDRESS` environment value. The route now trims it at that
boundary, preserves the configured-at-runtime fallback for blank values, and
has a focused route regression test.

**Live verification**

- Vercel production deployment `dpl_EyfzwpWydz1MyHffRu2MpdAbitci` reached
  `READY` and was aliased to `https://www.oboe.sh`.
- `GET /.well-known/oboe-agent.json` on the public alias returned 200.
- Parsed assertion: `payments.token` length 42, valid `^0x[0-9a-fA-F]{40}$`, and
  no trailing LF or other whitespace.

### ISSUE-003: Convex error codes lose their HTTP status mapping

| Field | Value |
|---|---|
| Severity | high — fixed and locally verified |
| Category | functional / API contract |
| First observed | 2026-07-15 |
| Evidence | authenticated/local handler audit; `src/lib/api-v2/route.ts` and `responses.ts` |
| Expected | `UNAUTHORIZED` → 401, `FORBIDDEN` → 403, `IDEMPOTENCY_CONFLICT`/`STALE_RESOURCE` → 409, `RATE_LIMITED` → 429 |
| Actual | The route lowercases Convex error codes before a response mapper that matches uppercase names, collapsing these cases to 400 |

This broke clients that must distinguish authentication, authorization,
retry/conflict, and throttling behavior. `408e25d` now normalizes only for
classification while preserving the original error code; focused tests cover
401/403/409/429.

### ISSUE-004: API-key creation is rejected by Better Auth metadata configuration

| Field | Value |
|---|---|
| Severity | high — fixed and locally verified |
| Category | functional / identity setup |
| First observed | 2026-07-15 |
| Evidence | authenticated/local handler audit; `src/lib/api-v2/agent-keys.ts` and `convex/auth.ts` |
| Expected | A valid authenticated agent can create a scoped API key as required by A-ID-04/A-ID-05 |
| Actual | The route always sends metadata, but Better Auth metadata is disabled, producing `METADATA_DISABLED` |

`9e2527a` enables the intended metadata contract and preserves the key scope
and revocation boundary. A live successful creation still requires an Oboe
human session, which is an external prerequisite rather than a fabricated QA
credential.

### ISSUE-005: Default API-key expiry is configured in the wrong time unit

| Field | Value |
|---|---|
| Severity | medium — fixed and locally verified |
| Category | security / identity lifecycle |
| First observed | 2026-07-15 |
| Evidence | authenticated/local handler audit; `convex/auth.ts` |
| Expected | The documented default expiry is 90 days |
| Actual | Milliseconds are supplied to Better Auth's seconds-based `defaultExpiresIn`, resulting in roughly 90,000 days |

`9e2527a` uses the installed Better Auth runtime's seconds-based default and
asserts the 90-day policy in a focused test.

### ISSUE-006: Payment-authentication failures are returned as generic 400 errors

| Field | Value |
|---|---|
| Severity | medium — fixed and locally verified |
| Category | functional / payment boundary |
| First observed | 2026-07-15 |
| Production evidence | Unauthenticated purchase/funding intent probes returned `payment_intent_failed` with 400 and an authentication message |
| Local evidence | `src/lib/api-v2/payment.ts` catches `ApiAuthenticationError` and maps it to 400 |
| Expected | Missing/invalid API authentication is a structured 401 `authentication_required` response |
| Actual | Clients receive 400 `payment_intent_failed`, obscuring the auth boundary and retry behavior |

`e5f8713` preserves safe no-money-write behavior while returning 401
`authentication_required`; purchase, funding, and bond intent boundary tests
cover the change.

### ISSUE-007: Recovery idempotency keys are required but not enforced

| Field | Value |
|---|---|
| Severity | medium — fixed and locally verified |
| Category | correctness / idempotency |
| First observed | 2026-07-15 |
| Evidence | authenticated/local handler audit; `src/lib/api-v2/handlers.ts` and `convex/accountRecovery.ts` |
| Expected | Reusing an idempotency key with a different recovery payload yields a structured conflict; a same-payload retry is safe |
| Actual | Recovery routes require `Idempotency-Key` but pass no key to Convex, so neither persistence nor conflict validation occurs |

`647e9e1` threads the key through the public mutation boundary, persists the
server-computed fingerprint/result, and makes status a query. A Convex fixture
test covers same-request replay and conflicting reuse without an account
takeover path.

### ISSUE-008: Public content capability omitted its protected prerequisite

| Field | Value |
|---|---|
| Severity | medium — fixed and verified |
| Category | functional / capability contract |
| Evidence | Anonymous content request returned 401 while skill detail advertised `read_content.allowed:true` without an entitlement prerequisite |
| Fix commit | [`75095e7`](https://github.com/t3nsed/oboee/commit/75095e7) |

The capability now explicitly states `authenticated_and_granted`; the protected
route remains available to an authenticated principal with a valid grant, while
anonymous agents no longer have to infer the boundary from a failed request.

### ISSUE-009: Malformed public resource IDs leaked Convex errors as 400

| Field | Value |
|---|---|
| Severity | medium — fixed and verified |
| Category | functional / API contract |
| Evidence | `GET /api/v2/skills/not-a-skill-id` and other public resource reads returned generic 400 `request_failed` |
| Fix commit | [`d99b200`](https://github.com/t3nsed/oboee/commit/d99b200) |

Public routes now reject clearly malformed Convex IDs before the database call
and return the documented 404 `not_found` envelope. Valid-looking unknown IDs
still reach Convex and resolve according to resource existence.

### ISSUE-010: Malformed catalog/RFS limits produced unstable pages

| Field | Value |
|---|---|
| Severity | medium — fixed and verified |
| Category | functional / pagination contract |
| Evidence | `GET /api/v2/catalog?limit=abc` returned 200 with an empty page and `nextCursor:"undefined"`; RFS returned generic 400 |
| Fix commit | [`d99b200`](https://github.com/t3nsed/oboee/commit/d99b200) |

The shared public parser now requires a positive integer, caps safe large
values at 100, and returns structured 400 for malformed input.

### ISSUE-011: Published author links were inconsistent or unresolved

| Field | Value |
|---|---|
| Severity | medium — fixed and verified |
| Category | functional / public read model |
| Evidence | Catalog/detail fallbacks disagreed (`author-:redteam` vs `verified-author`) and both linked profiles returned 404 |
| Fix commit | [`c148a47`](https://github.com/t3nsed/oboee/commit/c148a47) |

Catalog, skill detail, RFS detail, and the author query now share a deterministic
fallback handle and can resolve a public profile projection when a legacy row
has no `publicProfiles` record.

### ISSUE-012: Retired API routes were not consistently explicit

| Field | Value |
|---|---|
| Severity | medium — fixed and verified |
| Category | compatibility / migration contract |
| Evidence | `/api/v1/*` returned HTML 404 and `GET /api/rfs` returned 405 despite the manifest promising 410 retirement |
| Fix commit | [`c266937`](https://github.com/t3nsed/oboee/commit/c266937) |

The v1 root/catch-all and unversioned RFS collection GET now return the same
machine-readable `api_version_retired` 410 envelope with migration links.

### ISSUE-013: OpenAPI omitted live query and protected-error semantics

| Field | Value |
|---|---|
| Severity | low — fixed and verified |
| Category | documentation / generated-client contract |
| Evidence | Live catalog/skills/RFS filters were absent from `parameters`, and protected reads/commands omitted 401/409 responses |
| Fix commit | [`2e3470b`](https://github.com/t3nsed/oboee/commit/2e3470b) |

The generated OpenAPI now documents the catalog/RFS filters, limit rules, and
the authentication/conflict/rate-limit statuses used by the handlers.

### ISSUE-014: Valid-looking cross-table IDs leaked Convex errors as 400

| Field | Value |
|---|---|
| Severity | medium — fixed and live-verified |
| Category | functional / API boundary |
| Evidence | 32-character IDs with the wrong Convex table prefix returned generic 400 `request_failed` on public skill, review, fixture, recovery, RFS, evaluation, evidence, and settlement reads |
| Fix commit | [`d617148`](https://github.com/t3nsed/oboee/commit/d617148) |

The HTTP regex check from `d99b200` correctly rejected obviously malformed IDs,
but a syntactically shaped ID could still fail inside Convex's table-specific
`v.id(...)` validator. Public queries now accept strings at that boundary and
call `db.normalizeId(table, value)` before typed reads. Unknown IDs return the
documented 404 or an empty public projection; authenticated write validators
remain table-specific.

Live verification after the production Convex push exercised the same wrong-table
ID across all affected public resources: no `request_failed` or 5xx responses.

### ISSUE-015: Browse search ignored published skills and advertised unsupported `q`

| Field | Value |
|---|---|
| Severity | low — fixed and live-verified |
| Category | functional / web-agent contract |
| Evidence | `/browse?q=zzzzzz` continued to show published skills, and the copyable agent handoff emitted `/api/v2/catalog?q=...` although OpenAPI has no free-text parameter |
| Fix commit | [`9117eb3`](https://github.com/t3nsed/oboee/commit/9117eb3) |

The web filter now applies to both loaded projections. The agent handoff keeps
only supported catalog filters and explicitly labels free-text search as a
web-only filter until a unified server-side text-search endpoint is introduced.
Live browser checks show `q=zzzzzz` hides both resource types, `q=cve` keeps the
two matching published skills, and the handoff contains no `q=` API parameter.

## Test records

Each record below names the exact command, URL, or screenshot that proves the
check. “Pass” means the observed result matches the current contract, not just
that the request completed.

| ID | Surface | Case | Result | Evidence |
|---|---|---|---|---|
| TEST-001 | public API | agent guide and OpenAPI shape | pass | `GET /.well-known/oboe-agent.json` and `GET /api/v2/openapi.json` returned 200; manifest token normalized after `8c6cb9d` |
| ISSUE-002 | public API | agent guide MPP token normalization | fixed and live-verified | `8c6cb9d`; production `dpl_EyfzwpWydz1MyHffRu2MpdAbitci`; live JSON assertion above |
| ISSUE-003 | guarded API | status mapping for auth/forbidden/conflict/rate-limit errors | fixed and locally verified | `408e25d`; 9 focused status/origin tests |
| ISSUE-004 | identity API | API-key creation with Better Auth metadata | fixed and locally verified | `9e2527a`; 2 auth-policy tests; live success requires Oboe session |
| ISSUE-005 | identity API | default API-key expiry window | fixed and locally verified | `9e2527a`; 90-day seconds-based policy test |
| ISSUE-006 | payment API | unauthenticated payment intent status | fixed and locally verified | `e5f8713`; purchase/funding/bond cases now 401 |
| ISSUE-007 | recovery API | idempotency-key persistence and conflict | fixed and locally verified | `647e9e1`; Convex same-key replay/conflict test |
| ISSUE-008 | public API | protected content capability prerequisite | fixed and locally verified | `75095e7`; capability test plus live anonymous 401 |
| ISSUE-009 | public API | malformed resource IDs | fixed and locally verified | `d99b200`; public-parameter test |
| ISSUE-010 | public API | malformed pagination limits | fixed and locally verified | `d99b200`; public-parameter test |
| ISSUE-011 | public API | author fallback link consistency | fixed and Convex-verified | `c148a47`; imported author projection test |
| ISSUE-012 | compatibility API | retired v1/unversioned routes | fixed and locally verified | `c266937`; 16 legacy route tests |
| ISSUE-013 | public API | OpenAPI query/error contract | fixed and locally verified | `2e3470b`; OpenAPI contract tests |
| ISSUE-014 | public API | wrong-table but syntactically shaped IDs | fixed and live-verified | `d617148`; `convex/publicIds.test.ts`; live matrix across 13 public resource paths |
| ISSUE-015 | browser/agent contract | browse search and handoff parity | fixed and live-verified | `9117eb3`; `src/lib/handoff.test.ts`; browser-use `q=zzzzzz` and `q=cve` checks |
| TEST-002 | public API | catalog/detail/version consistency | pass for legacy skill | ISSUE-001 evidence above |
| TEST-003 | public API | public endpoint and malformed-input sweep | pass | 89 OpenAPI paths / 102 operations: 14 public 200, 4 public 404, 82 guarded 401, 2 expected recovery schema 400, 0 5xx |
| TEST-004 | guarded API | unauthenticated read/write boundary | pass | Live sweep returned structured `401 authentication_required` for all guarded operations; no mutations created |
| TEST-005 | local/production Convex | identity, money safety, recovery, quarantine | pass for covered fixtures | Focused Convex/API tests plus production deployment to `different-clownfish-198`; money gates remained off |
| TEST-006 | browser | signed-out deep link | pass after fix | browser-use state and [`browse-live-final.png`](production-20260715/screenshots/browse-live-final.png) captured 2026-07-15 |
| TEST-007 | browser | browse search behavior | pass | Live `q=zzzzzz` hides both sections; `q=cve` retains both matching skills and removes unsupported API `q` from handoff |

## Fix ledger

| Commit | Fix | Regression proof | Live proof |
|---|---|---|---|
| `d96e71f` | Serve imported legacy details read-only and align discovery metadata | 28 Vitest files / 219 tests | browse, skill, version, and catalog HTTP 200 |
| `8c6cb9d` | Normalize the MPP token address in the public agent guide | 2 focused route tests; full 221-test suite; typecheck | production deployment ready; public manifest has a clean 42-character EVM address |
| `408e25d` | Preserve HTTP statuses for Convex error codes | 9 focused status/origin tests | current production deployment includes the status mapping; live unauthenticated sweep returns structured 401s |
| `9e2527a` | Make Better Auth API-key creation and expiry match the documented identity contract | 2 focused auth-policy tests; typecheck | local Better Auth runtime contract verified; production guarded success requires Oboe session |
| `e5f8713` | Return authentication-required for unauthenticated payment intents | 3 intent boundary cases; 10 focused tests | live guarded sweep returns 401 before payment work; no money writes created |
| `647e9e1` | Enforce recovery idempotency keys at the mutation boundary | Convex replay/conflict integration test; typecheck | Convex production deployment includes the idempotent recovery functions; unauthenticated recovery schema remains non-mutating |
| `fa8d98b` | Block held skills from purchase and redemption | capability + Convex skill tests; typecheck | Convex production deployment includes the held/quarantined safety checks; money gates remained off |
| `d99b200` | Validate public API IDs and pagination limits | public parameter tests; typecheck | live malformed limits return structured 400; clearly malformed IDs return 404 |
| `c148a47` | Resolve public author fallbacks | 2 Convex skill/author tests; typecheck | live catalog/detail author links resolve through the public author projection |
| `2e3470b` | Document v2 query and error contracts | 4 OpenAPI/guide tests; typecheck | live OpenAPI contains the documented query and protected-error responses |
| `c266937` | Make retired API routes explicit | 16 legacy route tests; typecheck | live v1 and unversioned RFS probes return machine-readable 410 |
| `990e82b` | Refresh generated Convex API bindings after public author projection changes | Convex codegen; typecheck | included in production Convex/Vercel state |
| `d617148` | Normalize table-specific public Convex IDs before reads | `convex/publicIds.test.ts`; typecheck | production invalid-ID matrix returns 404/empty results; no generic 400 or 5xx |
| `1a1b3ea` | Document multipart evidence upload request schema | OpenAPI contract test; typecheck | live `/api/v2/openapi.json` includes multipart binary evidence schema |
| `3a3080d` | Bind bond intents to their RFS | 93 route/payment tests; typecheck | current production Vercel/Convex deployments include the RFS binding |
| `9117eb3` | Apply browse search to both projections and correct agent handoff semantics | `src/lib/handoff.test.ts`; typecheck | Vercel `dpl_CSuZE9Qmk226ZbjiwbUbvohVezmj`; live browser checks pass |

## User-story drift register

This section is maintained from the live endpoint audit and the story-vs-route
review. It distinguishes a fixed runtime defect from a workflow that is not yet
exposed by the current product.

| Stories | Current evidence | Disposition |
|---|---|---|
| A-DIS-01, H-DIS-03 | `/api/v2/catalog` and `/api/v2/rfs` are coordinated projections, not one unified searchable collection; catalog filters are server-side, RFS search is limited. | Story wording updated to “coordinated projections” until a unified endpoint is intentionally added. |
| A-USE-06, A-EVAL-09, A-REV-04 | Harmful-review `held` state previously leaked purchase/redemption paths; all held/quarantined purchase, redemption, payout-confirmation, and capability paths are now blocked. | Runtime fixed in `fa8d98b`; safe fallback remains explicit and never silently substitutes content. |
| H-REV-04, A-FUL-05, A-ID-06 | High-value assignment confirmation exists in Convex but has no v2 route/OpenAPI/UI action. | Marked as a guarded workflow prerequisite; not claimed complete. |
| H-OWN-03 | Wallet challenge/list/primary flows exist; explicit rotation, revocation-history, and prebroadcast destination correction are not exposed in v2. | Story acceptance narrowed to the shipped scope; missing money-destination controls remain a pre-rollout blocker. |
| A-API-02, A-API-04, H-OWN-07 | Recovery writes now persist idempotency fingerprints/results; status is a query. | Runtime fixed in `647e9e1` and included in the production Convex deployment; live positive recovery still requires controlled identity/wallet fixtures. |
| A-EVAL-05 | Evidence upload is implemented as multipart operational code and the generated OpenAPI schema now describes fields, limits, and the binary file part. | Contract gap fixed in `1a1b3ea`; live positive upload remains gated by authenticated storage fixtures. |
| A-API-03, A-DIS-01 | Public resource reads now normalize table-specific IDs, and the web search filters both loaded projections while the agent handoff advertises only supported API parameters. | Runtime fixed in `d617148` and `9117eb3`; a future unified server-side text search remains optional product scope. |
| A-API-01, A-API-03 | Capabilities are status-oriented on public projections and now explicitly identify protected content prerequisites; they are not fully viewer-aware without a live identity. | Story wording updated to avoid claiming principal-specific capability computation on public reads. |

## Remaining blockers and prerequisites

- Live authenticated browser coverage requires an Oboe session; a Vercel SSO
  session is not an Oboe account session.
- Money-writing and v2 activation flows must remain non-destructive while the
  production fixtures and custody gates are off.
- High-value assignment confirmation still exists only as a Convex human-action
  primitive; the dedicated v2 route/OpenAPI/UI operation remains a rollout
  prerequisite.
- Full wallet rotation/revocation history and prebroadcast destination
  correction remain future human-only workflow scope.
