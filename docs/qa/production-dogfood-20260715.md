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
| High | 0 | 1 |
| Medium | 1 | 0 |
| Low | 0 | 0 |
| **Total** | **1** | **1** |

The prior high-severity detail-page failure is recorded below as fixed. New
findings are added immediately with reproduction evidence and a commit link.

## Test matrix

| Area | User-story references | Evidence target | Status |
|---|---|---|---|
| Machine contract and discovery | A-ID-01, A-DIS-01..05, H-DIS-01..09 | agent guide, OpenAPI, catalog, filters, deep links, exact versions | in progress |
| Public MPP reads | A-API-01, A-API-03..04 | every public GET, malformed IDs, pagination, stable error envelopes | in progress |
| Auth/session boundary | A-ID-02..06, H-OWN-01 | sign-in/session behavior, 401/403 distinction, guarded UI | in progress |
| Wallets, keys, delegations | A-ID-04..05, H-OWN-02..03 | challenge/proof flows, revocation, permission checks | in progress |
| Purchase and content | A-USE-01..06 | exact-version intent, idempotency, quarantine, access, install | in progress |
| RFS lifecycle | A-RFS-01..10, A-FUL-01..10 | validation, funding, race/idempotency, application, submission | in progress |
| Evaluation and evidence | A-EVAL-01..12, H-REV-01..07 | eligibility, fixtures, evidence ACL, corrections, harm/dispute | in progress |
| Settlement and operations | A-MON-01..06 | obligations, holds, recovery, ops role boundaries | in progress |

## Baseline environment

- The branch was clean at `d96e71f` before this pass; no pull request existed.
- Production policy-v2 feature activation and money writes remain disabled while
  the guarded workflows are verified.
- `agent-browser` is not installed in this environment, so the dogfood browser
  evidence uses the installed `browser-use` CLI as a documented fallback.
- No Oboe user credentials or wallet secrets are assumed. Authenticated tests
  use repository fixtures/local Convex tests unless the user supplies a live
  login session.

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
| Severity | medium — open at discovery; fix in progress |
| Category | functional / API contract |
| First observed | 2026-07-15 |
| Production URL | https://www.oboe.sh/.well-known/oboe-agent.json |
| Evidence | [`issue-002-agent-guide.png`](production-20260715/screenshots/issue-002-agent-guide.png) and the raw response below |
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

**Root-cause hypothesis and fix target**

`src/app/.well-known/oboe-agent.json/route.ts` serializes the raw
`MPP_FUNDING_TOKEN_ADDRESS` environment value. Normalize it at that boundary,
preserve the configured-at-runtime fallback for blank values, add a route
regression test, deploy the isolated fix, and repeat the live assertion.

## Test records

Each record below names the exact command, URL, or screenshot that proves the
check. “Pass” means the observed result matches the current contract, not just
that the request completed.

| ID | Surface | Case | Result | Evidence |
|---|---|---|---|---|
| TBD | public API | agent guide and OpenAPI shape | pending | to be appended |
| ISSUE-002 | public API | agent guide MPP token normalization | fail before fix | `production-20260715/screenshots/issue-002-agent-guide.png`; live JSON assertion above |
| TBD | public API | catalog/detail/version consistency | pass for legacy skill | ISSUE-001 evidence above |
| TBD | browser | signed-out deep link | pass after fix | browser-use state captured 2026-07-15 |

## Fix ledger

| Commit | Fix | Regression proof | Live proof |
|---|---|---|---|
| `d96e71f` | Serve imported legacy details read-only and align discovery metadata | 28 Vitest files / 219 tests | browse, skill, version, and catalog HTTP 200 |
| pending | Normalize the MPP token address in the public agent guide | pending | pending |

## User-story drift register

This section will contain only changes justified by current production/API
evidence. A story is not marked stale merely because its workflow requires a
credential or a disabled money gate; those are prerequisites to verify, not
permission to silently remove the requirement.

## Remaining blockers and prerequisites

- Live authenticated browser coverage requires an Oboe session; a Vercel SSO
  session is not an Oboe account session.
- Money-writing and v2 activation flows must remain non-destructive while the
  production fixtures and custody gates are off.
