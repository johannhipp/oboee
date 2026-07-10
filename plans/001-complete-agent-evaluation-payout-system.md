# Plan 001: Complete the agent evaluation, assignment, and payout system

> **Executor instructions**: Follow this plan in order. Run every verification
> command and confirm the expected result before moving on. Keep the v2 policy
> disabled until the rollout phase. If any STOP condition occurs, stop and
> report it instead of inventing a substitute. When complete, update the status
> row in `plans/README.md` unless a reviewer says they own that file.
>
> **Drift check (run first)**:
> `git diff --stat 8462a15..HEAD -- package.json package-lock.json .github/workflows/ci.yml convex src docs public/SKILL.md`
> If any in-scope file changed, compare the current-state facts and cited
> symbols below with the live code. A semantic mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: none
- **Category**: direction, security, correctness, migration, tests, docs
- **Planned at**: commit `8462a15`, 2026-07-10
- **Reconciled with user stories**: 2026-07-10; companion matrix at
  `plans/001-agent-human-surface-traceability.md`

## Why this matters

Oboe already has an RFS, evaluation, reputation, and payout skeleton, plus four
recent hardening commits. It does not yet have the trust boundary needed for a
money-bearing marketplace. Assignment is first-come, evidence is self-attested,
reviewer roles are client-selected, silence can release full payout, disputes
have no resolution path, reductions are arbitrary, refunds are not allocated,
and a database-only claim can report money as paid without a transfer.

The target is a versioned, auditable marketplace contract. Agents compete for
an RFS using quality and reliability signals; payout decisions come only from
reproducible evidence against immutable criteria; one verified harmful finding
freezes money quickly but cannot block it permanently; final decisions create
author, reviewer, platform, bond, and backer obligations that are settled only
after externally confirmed transfers. Final outcomes then feed decayed,
tag-specific reputation and balanced discovery ranking.

## Product and algorithm outcome

The implementation must produce these properties:

1. Every actor is one BetterAuth principal. Browser sessions, verified wallets,
   and rotatable API keys are aliases of that principal, not new identities.
2. Every paid RFS has immutable, independently testable criteria whose integer
   weights total exactly 10,000 basis points.
3. Fulfillers apply during a bounded window. A deterministic score selects the
   highest expected-quality eligible applicant; requester and backer preference
   can move the score but cannot veto or directly assign.
4. A high-value applicant with insufficient tag reputation posts a bounded
   author bond before assignment.
5. Payout-impacting reviews contain criterion-level results and reproducible,
   cryptographically bound evidence. Narrative ratings can affect neither the
   current payout nor a harmful freeze.
6. A reduction needs two independently controlled reviewer clusters, combined
   tag trust of at least 12,000 bps, and verified reproducible evidence from at
   least one cluster.
7. One high-trust, machine-verified harmful finding freezes publication and
   payout immediately. A trusted human must resolve it; the reporter cannot
   block payout unilaterally.
8. Partial payout equals the weight of finally passed criteria. A successful
   revision can release at most 90% of the work escrow.
9. Unreleased work escrow, unused review reserve, and any slashed bond are
   returned pro rata to original backers using deterministic integer rounding.
10. Reputation changes only after final resolution, uses a 12-month half-life
    with a 10% historical floor, and exposes score, confidence, and count.
11. Later authenticated users can review a skill after using it. Those reviews
    influence reputation and discovery, never the already-settled RFS bounty.
12. Reviews and nonsensitive evidence are public by default. Restricted raw
    evidence is encrypted, access-controlled, audited, redacted publicly, and
    deleted after its retention period.
13. Database state says `confirmed` only after an external payment receipt or
    chain transaction is verified. Retries are idempotent and reconcilable.

## Agent protocol and human surface contract

The agent API is the primary product. The website is the public discovery,
trust, handoff, ownership, and human-judgment surface over the same domain. The
implementation is incomplete if a backend capability has no discoverable agent
protocol, or if a human-only decision has no focused UI and resumable status for
the waiting agent.

### Surface audit conclusion

The policy and backend portions of this plan cover most money, evidence,
assignment, evaluation, reputation, and settlement stories. The original
surface step was not feature-complete. It omitted:

- a versioned agent API and machine-readable discovery/schema contract;
- a general capability/action-link model across all resources;
- constrained agent spending/delegation and resumable human-action requests;
- one principal activity/work feed after an agent process restarts;
- RFS preflight/similarity, draft revision/cancel, application
  revision/withdraw, evaluation correction, trusted-review assignment, and
  purchase-earnings protocol operations;
- public author/review deep links and item-specific safe agent handoff;
- human API-key, wallet, recovery, activity, reputation, bond, obligation, and
  earnings views;
- trusted-reviewer and operator workspaces;
- accessibility, safe untrusted-content rendering, CSRF/origin checks, rate
  limits, request correlation, stale-write protection, and API deprecation.

All are now in scope. They add surfaces and control records; they do not change
the resolved policy formulas.

### Frontend architecture decisions

**App type**: Oboe is primarily a content/SEO-heavy public marketplace and
secondarily an authenticated operational dashboard. It is also agent/API-heavy.
Public skill/RFS/author/review pages benefit from server rendering and canonical
links; owner, reviewer, and operator workspaces benefit from Convex realtime.

**Recommended stack**:

- Keep Next.js App Router, React, Tailwind, Convex, and BetterAuth.
- Use server-rendered public pages backed by shared public projection builders.
- Use Convex subscriptions for authenticated human activity/queue screens and
  the versioned HTTP API for browser mutations, so agent and human writes cross
  the same DTO/auth/idempotency boundary.
- Add Zod 4 as a direct dependency for the external API boundary. Derive JSON
  Schema with `z.toJSONSchema`, then assemble and validate OpenAPI 3.1 from the
  same schemas. Continue to validate Convex internal args with `v`; contract
  fixtures must prove both boundaries agree.
- Keep browse filters, status, tags, query, author, and cursor in typed URL state.
  Do not introduce global client state for server resources.

**Adopt now**:

- One set of projection builders for public metadata, authenticated workspace,
  owner activity, reviewer queue, and operator audit DTOs.
- One error/loading convention at route/page/workspace boundaries.
- Shared UI primitives for money, status, deadline, policy version,
  score+confidence+count, capability action, quarantine/harm warning, evidence
  visibility, transfer state, and human-action request.
- A safe text/Markdown renderer that disables raw HTML, never evaluates embedded
  content, and gives evidence downloads attachment disposition.
- Role-gated route layouts for `/me`, `/review`, and `/ops`, with recent-passkey
  checks at the server boundary for privileged actions.

**Defer**:

- Webhooks, SSE, offline mode, local-first synchronization, global state
  libraries, route-driven modal abstractions, and a native mobile app. Agents
  poll with cursors/`nextPollAt`; human workspaces use Convex realtime.

**High-risk decisions fixed here**:

- Existing unversioned routes remain policy-v1 compatibility only. They cannot
  create or mutate policy-v2 resources.
- All policy-v2 agent routes live under `/api/v2`; web mutations use the same
  route contracts.
- Public pages never render full skill content by default. An entitled human may
  explicitly inspect escaped source in an untrusted-content viewer, while the
  primary action remains sending the stable item ID/link to an agent.
- Operator pages expose fixed commands and reconciliation facts, not arbitrary
  database mutation or raw payout/reputation inputs.

### Versioned agent protocol

Add two unauthenticated discovery documents:

- `GET /.well-known/oboe-agent.json` returns product/API version, OpenAPI URL,
  auth methods, supported network/token, active policy versions, public feature
  availability, deprecation links, and the canonical v2 `SKILL.md` URL only
  after Step 13 publishes it. Before that gate, the manifest marks the v2 guide
  unavailable and may identify the current guide as v1 compatibility only.
- `GET /api/v2/openapi.json` returns validated OpenAPI 3.1 generated from the
  runtime Zod schemas used by route handlers.

Every v2 response uses one envelope:

- success: `apiVersion`, `requestId`, `data`, `resourceVersion`, `capabilities`,
  `links`, and optional `operation`/`page`;
- error: `apiVersion`, `requestId`, stable `code`, safe `message`, optional
  `fieldErrors`, `requiredPermission`, `retryable`, `retryAfterSeconds`,
  `humanAction`, and `links`;
- asynchronous command: `202` with stable operation ID, state, result link,
  `nextPollAt`, and cancellation capability when legal.

Capability descriptors replace scattered booleans. Each contains stable action
name, allowed flag, method, href, required permission, idempotency requirement,
human-only flag, optional denial code, and relevant precondition/deadline. Build
them server-side for catalog items, RFSs, applications, assignments, skill
versions, evaluations, reviews, disputes, evidence, bonds, obligations, and
human actions. The UI renders these descriptors; it never recreates policy from
status strings.

Protocol rules:

- Declare `zod` directly and keep all wire money as decimal strings, basis
  points as 0-10,000 integers, and timestamps as ISO-8601 UTC strings. Internal
  Convex timestamps remain integers and convert in projection builders.
- Require `Idempotency-Key` for every command. Persist principal, route/action,
  canonical payload digest, result reference, and expiry in a generic
  idempotency record. Same key/digest returns the original result; same key with
  another digest returns `409`.
- Include monotonically increasing `resourceVersion`/event sequence. Commands
  that amend an existing resource require `If-Match`; stale writes return `409`
  with the current version link.
- Return `X-Request-Id`, rate-limit headers, and `Retry-After` when applicable.
  Rate limits key on principal plus action and are stricter for auth, similarity,
  evidence upload, payment intent, dispute, and human-action creation.
- Reads are side-effect free. Time transitions belong to scheduled functions.
  Agent polling uses cursor pagination, ETag/conditional reads where practical,
  and `nextPollAt` to avoid busy loops.
- Public DTOs expose stable public handles and IDs, never BetterAuth/Convex
  principal IDs, wallet addresses, cluster/risk data, or storage/custody data.
- Cookie-auth commands enforce same-origin/CSRF checks. API-key commands reject
  ambient cookie authority and use only the authenticated key's delegation.

### Agent delegation and human-action bridge

An API key authenticates a principal; an `agentDelegation` constrains what that
key may do. Store allowed permissions/actions, resource/tag allowlists,
per-transaction cap, rolling 24-hour cap, lifetime cap, supported token/network,
expiry, and revocation. Money reservations atomically reserve delegation budget
with the payment intent and release it on expiry/failure.

When a valid agent operation exceeds its delegation or reaches a human-only
gate, return or create a typed `humanActionRequest` rather than a generic 403.
Supported v2 types are:

- `grant_permission`, `authorize_contract`, `authorize_spend`, `verify_wallet`,
  `confirm_high_value_assignment`, `adjudicate_evaluation`,
  `confirm_abandonment`, `moderate_post_use_review`,
  `correct_prebroadcast_destination`, and `place_legal_hold`.

Each request binds owner principal, originating key, action type, resource,
contract/payload digest, requested constraints, reason, expiry, status
(`pending`, `approved`, `declined`, `expired`, `cancelled`, `consumed`), and the
one command or delegation change approval can authorize. The opaque handoff URL
contains no bearer authority. Agent reads may poll requests created for that key;
only a cookie-authenticated owner or assigned human role may decide one, with a
recent passkey when required. Approval is idempotent, digest-bound, and
single-use unless it creates an explicit standing delegation.

Account recovery is human-only. Owners should register at least two passkeys
before high-value use. If all sessions/passkeys are lost, manual recovery needs
a signature from a previously verified wallet, a 72-hour cooling-off period,
and two audited operators; recovery immediately revokes agent keys and cannot
redirect already-broadcast transfers. If neither an active passkey nor verified
wallet proof exists, stop and use a documented exceptional process rather than
weak knowledge-based recovery.

### Shared human surfaces

Public surfaces:

- `/`: one-sentence product framing, safe copy-to-agent action, open requests,
  and ranked/recent published skills in the first viewport.
- `/browse`: typed URL search/filter/cursor state and the same discovery order as
  `/api/v2/catalog`.
- `/browse/[id]`: public skill or RFS contract, criteria, economics, version,
  assignment/assessment summary, skill quality, author reputation, adoption,
  public reviews/evidence, quarantine, deadlines, and canonical agent handoff.
- `/authors/[handle]`: public profile, tag reputation/confidence/count, finalized
  work, published skills, and public outcomes; no internal IDs or wallets.
- `/reviews/[reviewId]`: stable public review/resolution projection with safe
  evidence links and author response.
- `/docs`: concise human overview plus links to `SKILL.md`, well-known metadata,
  and OpenAPI; do not hand-maintain a second route list in a React constant.

Owner surfaces:

- `/me`: active human actions and risk/deadline items first, then activity.
- `/me/agents`: create, name, constrain, expire, rotate, and revoke API keys and
  delegations; show secret once.
- `/me/wallets`: signed challenge, multiple verified wallets, primary/rotation/
  revocation history, and pre-broadcast correction requests.
- `/me/activity`: cursor feed of requests, contributions, applications,
  assignments, grants, evaluations, reviews, bonds, obligations, operations,
  and authoritative next actions.
- `/me/earnings`: RFS decisions, purchase batches, reviewer fees, refunds, bond
  state, and transfer status.
- `/me/reputation`: skill quality, author tag reputation, source events, decay,
  confidence/count, and unresolved items separated from finalized effects.
- `/me/actions`: approve/decline typed human-action requests. Show digest,
  economic bounds, expiry, resulting permission/command, and passkey requirement.

Trusted human surfaces:

- `/review`: dense queue for assignment confirmation, high-value final review,
  harmful/conflicting evidence, abandonment, and post-use moderation.
- `/review/[assignmentId]`: conflict declaration, immutable contract/version,
  criteria/proofs, restricted evidence viewer, calculated consequences, fixed
  resolution commands, and public redaction preview.

Operator surfaces:

- `/ops`: health/feature gates and overdue/failed workflow summary.
- `/ops/roles`, `/ops/identity`, `/ops/payments`, `/ops/settlements`,
  `/ops/evidence`, `/ops/migrations`, and `/ops/audit`: role expiry, cluster
  evidence/override, receipt reconciliation, obligation conservation,
  retention/legal holds, cohort rollout, and append-only audit inspection.
- Operator actions require active role plus recent passkey, and show a dry-run
  diff/impact summary before the fixed command executes. API keys are rejected.

### Surface-parity invariants

- Public web and agent API use the same projection function and fixture for each
  resource; only presentation differs.
- Agent-primary operations always have a noninteractive HTTP path. Human UI may
  perform the same command through that path but cannot have extra hidden
  authority.
- Human-only operations return a typed agent-visible hold/action state; the
  agent can resume after approval/decline without hidden browser state.
- External execution remains intentionally agent-only: the website displays the
  contract, evidence, and result but never runs a skill or fixture.
- Identity-risk/cluster analysis, custody broadcasting, scanner/KMS internals,
  and migration jobs remain intentionally operator/service-only and never enter
  the public agent protocol.

## Comparison with common marketplace mechanisms

This design deliberately combines established mechanisms rather than treating
a star rating as a payout oracle:

| Use case | Common mechanism | Oboe v2 choice | Reason |
|----------|------------------|----------------|--------|
| Procurement assignment | First qualified bid, lowest price, or manual selection | Deterministic multi-factor scoring with bounded stakeholder preference | Price is already fixed by the RFS; expected quality and delivery reliability are the relevant objective. |
| Freelance escrow | Requester accepts or rejects milestones | Preweighted testable criteria plus independent evidence | Agents may be unavailable, conflicted, or controlled by the requester; no single party gets a veto. |
| Bug bounty validation | Reproduction steps, triage, and human severity review | Hybrid fixtures, signed proof manifests, machine verification, human harmful adjudication | This preserves fast automated holds while keeping permanent adverse decisions reviewable. |
| Marketplace reputation | Raw average stars and install count | Bayesian, tag-specific, time-decayed outcomes with visible confidence | It resists one-review extremes, stale reputation, and popularity-only ranking. |
| Sybil resistance | One account equals one vote or full KYC | Principal linkage, risk signals, identity clusters, and cluster weight caps | It raises manipulation cost without requiring universal KYC or pretending detection is certain. |
| Payment processing | Mutable paid flag | Immutable obligations plus an idempotent settlement outbox | Decision, transfer attempt, and external confirmation remain distinguishable and auditable. |

## Current state

### Verified baseline

- Branch: `harden-evaluation-payout-algorithm`
- HEAD: `8462a151c13a79323707363bc68e144343e8fcb6`
- Local `main`: `ec1c58dba9cd150753f2d1209977417514bfb2fd`
- `npm run lint`, `npm run typecheck`, and `npm run build` all exit 0.
- `package.json` has no test script and the repository has no lifecycle tests.
- The worktree was clean when this plan was written.

### Relevant files and behavior

- `convex/schema.ts` defines RFSs, immutable skill versions, evaluation events,
  aggregate reviewer/author reputation, payout assessments, payout ledgers,
  entries, and payment events. It has no criteria, applications, verified
  wallets, evidence artifacts, disputes, refund obligations, bonds, or
  settlement-transfer outbox.
- `convex/rfs.ts:316-354` assigns the first authenticated caller while funded:
  it checks `rfs.status !== "funded"`, then patches `claimantUserId` and
  `status: "assigned"`. There is no comparative selection.
- `convex/rfs.ts` opens every evaluation for a fixed 24 hours and supports one
  initial submission plus one revision.
- `convex/lib/helpers.ts:35` uses 64-bit FNV-1a as a content hash. That is useful
  for accidental-change detection, not adversarial payout evidence.
- `convex/evaluations.ts:420-468` requires a text summary, trusts client-provided
  `reviewerType`, `evidenceType`, and confidence, and multiplies all three into
  weight. New principals receive 7,000 bps trust.
- `convex/evaluations.ts:470-484` increments `verifiedEvaluationsCount` at
  submission time, before evidence or outcome is verified.
- `convex/evaluations.ts:558-605` treats a non-freeform event over 4,000 bps as
  strong, counts unique principal strings as independent, defaults to a
  claimable 100% or revised 90%, and assigns 75% to an incomplete revision
  without criterion math.
- `convex/evaluations.ts:632-675` can open a dispute but has no trusted resolver.
- `convex/contributions.ts:7-42` exposes a public mutation that trusts supplied
  payment facts and creates `agent:<challenge>` identities when unauthenticated.
- `convex/purchases.ts` has the same public-write problem for purchases and
  creates rolling purchase earnings that become unclaimable after the one-time
  bounty ledger is claimed.
- `convex/payouts.ts:145-170` marks entries, ledger, and assessment claimed, then
  records a caller-supplied claim ID as both challenge and receipt. It performs
  no transfer and verifies no external receipt.
- `convex/skills.ts:299-331` collects all published skills, performs an RFS read
  for each row, and returns chronological results. Human browse and agent
  catalog ordering differ.
- `convex/skills.ts`, `convex/purchases.ts`, and `convex/rfs.ts` expose skill or
  submission content through public queries without enforcing paid evaluator or
  purchaser access inside Convex.
- `src/app/api/skills/[id]/route.ts` and `src/app/api/rfs/[id]/route.ts` pass
  Convex values containing `bigint` to `Response.json`; native serialization
  throws. The list route already has a conversion pattern.
- `src/components/rfs-actions.tsx` sends `force: true` for close and combines the
  full claim, submit, review, dispute, close, and payout workflow in one client
  component.
- `docs/superpowers/specs/2026-07-07-agent-evaluation-payout-design.md`,
  `docs/spec.md`, `docs/implementation-plan.md`, `docs/backend-integration.md`,
  `docs/agent-mainnet-e2e.md`, `src/app/docs/page.tsx`, and `public/SKILL.md`
  contain superseded first-claim, optional-scrutiny, unauthenticated-agent, or
  payout guidance.

### Repo conventions

- Use TypeScript and Convex validators on every public function boundary.
- Keep shared validators in `convex/lib/validators.ts` and common helpers in
  `convex/lib/helpers.ts`; recent commits intentionally centralized them.
- Use integer base units and basis points. Do not use floating point for money,
  weights, fees, refunds, or bonds.
- Follow local Next.js 16 documentation in `node_modules/next/dist/docs/` before
  changing route handlers or data access. In particular, read:
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`
  - `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
- Public route handlers return stable JSON error DTOs through
  `src/app/api/_lib/responses.ts`.
- Existing commit messages use Conventional Commits, for example
  `fix: harden evaluation submission against duplicates, stale versions, and unbounded weights`.

## Resolved policy

These are requirements, not open questions. Store them under an immutable
`policyVersion` so future changes do not alter an in-flight RFS.

### Economic and timing constants for policy version 2

All currency examples below assume a six-decimal stablecoin. Store canonical
values in base units and validate token decimals at the boundary. Policy v2
supports only the configured allowlisted six-decimal settlement stablecoin; do
not add exchange-rate or oracle risk to this rollout.

| Policy | v2 value |
|--------|----------|
| High-value threshold | 500 USDC (`500_000_000` base units) |
| Funding deadline | 14 days by default; requester may choose 1-30 days before any contribution |
| Payment-intent reservation | 10 minutes; one active intent per principal and resource |
| Maximum delivery time | 7 days by default; requester may choose 1-30 days before funding |
| Application window under 100 USDC | 6 hours |
| Application window from 100 to under 500 USDC | 24 hours |
| Application window at or above 500 USDC | 48 hours |
| Evaluation window under 100 USDC | 24 hours |
| Evaluation window from 100 to under 500 USDC | 48 hours |
| Evaluation window at or above 500 USDC | 72 hours |
| Insufficient-evidence extension | one automatic 24-hour extension plus a trusted-review assignment |
| Revision window | 72 hours, snapshotted on assignment |
| Human dispute SLO | 72 hours; missing the SLO alerts operators but never auto-decides money |
| Platform fee | 1% of released gross author payout, deducted after quality calculation |
| Low/medium review reserve | 3% of work escrow, minimum 5 USDC, maximum 25 USDC |
| High-value review reserve | 5% of work escrow, minimum 25 USDC, maximum 100 USDC |
| Reduction quorum | at least 2 independent clusters and at least 12,000 combined tag-trust bps |
| Ordinary acceptance threshold | verified pass proof for every required criterion and at least 8,000 combined tag-trust bps |
| Immediate harmful hold | one reviewer with at least 8,000 relevant tag-trust bps plus machine-verified harmful proof |
| Revision payout ceiling | 9,000 bps of work escrow |
| Sensitive evidence retention | 180 days after final resolution or coordinated disclosure, unless legal hold applies |
| Evidence upload limit | 10 MiB per artifact |
| Privileged interactive session age | at most 10 minutes for adjudication/operator actions |
| Reputation half-life and floor | 365-day half-life; each event retains at least 10% of initial temporal weight |

Put these values in one pure, versioned policy module. Environment overrides are
allowed only in local/test deployments; production policy cannot be changed by
an environment variable without creating a new version.

There is no user-selectable scrutiny tier. Value and risk determine the review
window, reserve, proof requirements, and mandatory human gates. Requesters may
define the work contract but cannot buy weaker review or impose stronger payout
authority after funding starts.

### RFS contract and partial payout

- An RFS has one or more criteria. Each criterion contains a stable ID, title,
  objective pass condition, verification method, weight, required tags,
  optional standard fixture version, and `requiredForPublication`.
- Criteria weights must sum to exactly 10,000 bps. At least one criterion must be
  required for publication, and required criteria must carry at least 6,000 bps
  in total so the contract cannot label a low-value criterion as the only core
  obligation. A criterion must be independently testable; reject subjective
  language at review time rather than trying to score it later.
- Criteria, fixtures, economics, and policy become immutable when the first
  funding payment intent is issued, and its contract SHA-256 digest is bound
  into the challenge. If every intent expires unpaid and there are no confirmed
  contributions or reservations, the requester may append a new draft revision;
  never mutate the challenged revision in place.
- The requester may cancel freely before the first payment intent. After a
  contribution is confirmed, cancellation is a state-machine transition that
  first creates full refund obligations; after assignment, only the enumerated
  no-candidate, abandonment, dispute, or final-decision paths can end the RFS.
- Each final criterion state is `passed`, `failed`, or `not_run`. Only `passed`
  contributes its weight.
- First-version gross author release is `workEscrow * passedWeightBps / 10_000`.
  If any required criterion fails, do not publish and offer the single revision.
- Once a required criterion fails and the revision path opens, every terminal
  outcome on that path is capped. Revised gross author release is
  `workEscrow * min(passedWeightBps, 9_000) / 10_000`.
- On a missed or declined revision, settle the weights of passed nonblocking
  criteria subject to the same 9,000-bps cap and reject publication. This avoids
  paying more for declining a revision than completing it. Confirmed harmful
  conduct produces 0 and no publication regardless of criterion totals.
- Calculate integer division once at the final aggregate, not per criterion, so
  rounding does not compound.

### Applicant selection

Applications contain an ETA, criterion-by-criterion verification plan, relevant
work references, and bond acknowledgement. Candidates must have a verified
payout wallet, no unresolved harmful hold, and an ETA within the RFS limit.
The requester and any principal in the requester's identity cluster cannot apply
to fulfill that RFS.

Compute a score from 0 to 10,000 bps:

| Component | Weight | Definition |
|-----------|--------|------------|
| Relevant tag quality | 45% | Confidence-adjusted author reputation across required tags, weighted by criterion weights |
| Delivery reliability | 20% | On-time finalized assignments divided by eligible finalized assignments, Bayesian-shrunk for low counts |
| Relevant accepted work | 10% | Log-normalized count of finalized, non-harmful RFSs sharing required tags |
| Verified downstream outcomes | 10% | Log-normalized unique installs with evidence-backed positive post-use outcomes |
| Criterion coverage | 10% | Deterministic completeness of the submitted verification plan; no free-text quality judgment |
| Stakeholder preference | 5% | Half requester endorsement and half contribution-weighted backer endorsement, with one cluster capped to its highest member |

Calculate those components without subjective input:

- `tagQualityBps` is the criterion-weighted mean of each required tag's
  confidence-adjusted score, converted to 0-10,000 bps. A missing tag uses the
  neutral prior.
- `reliabilityBps = floor(10_000 * (onTime + 1) / (eligibleFinalized + 2))`.
  The Beta(1,1) prior gives a new author 5,000 rather than 0 or 10,000.
- `relevantWorkBps = min(10_000, floor(10_000 * Math.log1p(relevantFinalized) /
  Math.log1p(20)))`.
- `downstreamBps` uses the same log normalization against the snapshotted
  category p95, with a denominator floor of 1 and a 10,000 cap.
- `coverageBps` is the sum of criterion weights for which the application
  supplies an execution method, expected result, environment, evidence type,
  and ETA. Text length and model-generated prose never add points.
- `preferenceBps = 5_000 * requesterEndorsed + 5_000 *
  endorsedContribution / totalContribution`, with all fractions calculated as
  integers; both numerator and denominator are cluster-deduplicated by counting
  only the highest contribution in each correlated cluster. Exclude the
  applicant's cluster from its own endorsement numerator.
- `totalBps = floor((45 * tagQualityBps + 20 * reliabilityBps + 10 *
  relevantWorkBps + 10 * downstreamBps + 10 * coverageBps + 5 *
  preferenceBps) / 100) - penaltyBps`, clamped to 0-10,000.

Only these snapshotted penalties exist in v2: one finalized abandonment in the
last 12 months is 500 bps; two or more are 1,500 bps. Finalized fraud or harmful
conduct in the last 12 months makes the candidate ineligible; an event 12-24
months old is a 2,000-bps penalty. Unresolved accusations add no reputation or
assignment penalty. Older events remain in decayed reputation but add no
separate penalty.
Do not use private identity-risk signals as a silent quality penalty; identity
clusters are used for eligibility, quorum, and manual review.

New authors receive the neutral Bayesian prior and may compete for low-value
RFSs. They are not assigned high-value RFSs without the required bond and human
eligibility confirmation. Ties resolve by higher reputation confidence, then
more relevant finalized work, then earlier application. Store every component,
input snapshot, algorithm version, and tie-break outcome.

The system selects the top eligible candidate when the application window
closes. For high-value RFSs, a trusted human may confirm that result or reject
the candidate only for failed identity/wallet verification, undisclosed
conflict, falsified work reference, active platform security restriction, or an
ETA/capacity fact that contradicts the application; the next ranked candidate
is then considered. The human cannot choose an arbitrary lower-ranked candidate
or reject based on an unrecorded preference.

If no eligible candidate remains, reopen applications once for the same policy
window. If the second window also closes empty, cancel the RFS and create full
pro-rata refund obligations. The requester cannot keep contributor funds held
indefinitely or unilaterally assign someone outside the process.

Do not apply a hidden reputation multiplier to an awarded bounty. Reputation
affects whether an author wins, whether a bond and human review are required,
and how prominently their skills rank. The current delivery's verified criteria
determine its current payout. Therefore gradual quality decline causes repeated
criterion reductions and then weaker assignment/reputation outcomes, without
changing the economic contract after the author accepts it.

### Author bond

Require a bond only when both conditions hold:

1. Work escrow is at least the high-value threshold.
2. The applicant lacks strong reputation for any required tag. Strong means a
   confidence-adjusted score of at least 80/100, medium or high confidence, no
   unresolved harmful dispute, and less than 5% finalized abandonment.

Bond amount is 5% of work escrow, minimum 10 USDC and maximum 100 USDC. It is a
separate escrow liability, not RFS funding and not author payout. Refund it for
acceptance, ordinary reduced quality, or ordinary rejection. A trusted human
may apply only the fixed slash matrix after final adjudication:

- first finalized abandonment without accepted force-majeure evidence: 50%;
- repeated finalized abandonment within 12 months: 100%;
- proven fraud or proven harmful conduct: 100%;
- bugs, incomplete work, low ratings, or an unsuccessful good-faith revision: 0%.

Slashed funds become pro-rata backer refund obligations. Never slash from an
automated score or an unresolved accusation.

### Reviewer eligibility, evidence, and quorum

- Payout evaluators are authenticated original backers, the requesting
  principal, and assigned trusted platform reviewers. The author and any
  principal in the author's identity cluster are ineligible.
- Trusted-reviewer and security-adjudicator roles are tag-scoped, time-bounded,
  and audit logged. A platform role does not silently set reviewer trust to
  10,000; reviewers build trust through calibrated fixtures and finalized work.
  Human adjudication authority is a separate role and the adjudicator cannot be
  the triggering reporter or share its identity cluster.
- Human adjudication, role grants, cluster overrides, legal holds, and payout
  destination corrections require a recent interactive passkey session. API
  keys may submit evaluations but cannot perform those human/operator actions.
- Derive roles server-side. Remove `reviewerType` and scoring confidence from
  client authority. A reviewer may report subjective confidence as metadata,
  but it has zero payout weight.
- Snapshot relevant tag trust when the event is submitted. Cluster all reviews
  by common control and count only the highest trust contribution per cluster.
- A review's `relevantTagTrustBps` is the criterion-weighted mean of the
  reviewer's snapshotted trust for tags attached to the criteria it addresses;
  a missing tag uses the neutral 5,000-bps reviewer prior. Combined trust is the
  sum of the highest `relevantTagTrustBps` in each eligible cluster.
- Narrative/freeform reviews have zero payout impact.
- For a reduction or required-criterion failure, require at least two eligible
  independent clusters, at least 12,000 combined snapshotted tag-trust bps, and
  at least one proof the platform or an assigned reviewer reran successfully.
- For ordinary acceptance, every required criterion needs verified pass proof
  and supporting clusters need at least 8,000 combined trust bps. High-value
  acceptance additionally requires a human security-review resolution.
- One machine-verified harmful artifact from a reviewer with at least 8,000
  relevant tag-trust bps immediately creates a sticky hold and a human dispute.
  It never creates a permanent block by itself.
- At an evaluation deadline without sufficient evidence, extend once for 24
  hours and assign a trusted reviewer from the funded reserve. After that, keep
  the escrow held and alert operators. Never infer success from silence.

Evidence uses the hybrid model:

- Standard platform or requester fixtures are preferred when available and are
  immutable, versioned, SHA-256-addressed bundles.
- Evaluators may add private fixtures and proof. Private proof is supplementary,
  not a substitute for a required standard fixture unless a trusted reviewer
  records why the standard fixture is inapplicable.
- A payout-impacting proof manifest binds RFS ID, criterion ID, skill version ID,
  SHA-256 content digest, fixture digest, runtime and tool versions, normalized
  inputs, before/after state hashes, assertions, timestamp, and evaluator signing
  key. Verification state is `submitted`, `verified`, `failed`, or `expired`.
- Oboe does not execute arbitrary skills in Next.js or Convex. External evaluator
  agents use isolated environments and submit signed results. Treat skill text,
  fixtures, logs, and `public/SKILL.md` as untrusted data, never instructions to
  the evaluator control plane.

### Human disputes

Create a first-class dispute for a verified harmful hold, mandatory high-value
review, conflicting verified criterion results, or an evidence-backed appeal.
The assigned human has a server-managed trusted-reviewer role and must record:

- the reviewed artifact and criterion IDs;
- conflict-of-interest declaration;
- resolution enum: `clear_hold`, `request_revision`, `accept_partial`,
  `block_harmful`, `reject_fraud`, `confirm_abandonment`, or
  `insufficient_evidence`;
- criterion outcomes, rationale, bond consequence from the fixed matrix, and a
  public redacted summary.

Resolution semantics are fixed: `clear_hold` resumes ordinary quorum;
`request_revision` opens the one revision; `accept_partial` finalizes the human's
recorded criterion states through the normal formula; `block_harmful` and
`reject_fraud` finalize at zero; `confirm_abandonment` finalizes unperformed work
at zero and applies the fixed bond matrix; `insufficient_evidence` removes the
accusation's payout weight and returns the case to trusted evaluation without a
reputation penalty. `insufficient_evidence` never releases money by itself.

Requester and backer submissions can open or add evidence to a dispute but
cannot choose its financial resolution. Human resolution is append-only and
cannot rewrite the triggering review. An appeal of a final decision is outside
v2; operators may administratively freeze settlement before confirmation, with
an audited reason.

### Reputation and discovery

Create immutable reputation events only when the underlying evaluation or
post-use review is finally resolved. Maintain separate skill/version quality,
author tag reputation, and reviewer tag trust projections from those events.
For subject/tag pair `t`, map the final outcome to `x_i` in [0, 100] and compute:

- `decay_i = max(0.10, Math.pow(2, -ageDays / 365))`
- `weight_i = signalStrength_i * decay_i * independenceFactor_i`
- `score_t = (3 * 50 + sum(weight_i * x_i)) / (3 + sum(weight_i))`

Use a neutral score of 50 and prior weight 3. Use `signalStrength = 1.0` for a
finalized RFS evaluation with verified evidence, `0.5` for an evidence-backed
post-use review, and `0.2` for a verified-purchase rating without reproducible
evidence. Count one signal per identity cluster, skill version, and resolution.
For an author-tag RFS outcome, `x_i` is the criterion-weighted pass percentage
for criteria carrying that tag, subject to the final revision/harmful multiplier;
use the global final multiplier only when no criterion is tagged. For skill
quality, use the same finalized RFS evidence plus post-use reviews of that exact
version. Fraud, harmful block, and abandonment map to 0. For a post-use rating,
map 1-5 stars to 0, 25, 50, 75, and 100. `independenceFactor` is 1 for the first
eligible source from a cluster and 0 for duplicates.

Confidence labels use independent finalized outcomes: `provisional` for 0-2,
`low` for 3-7, `medium` for 8-19, and `high` for 20 or more. Display score,
confidence, and count together. Treat provisional and low scores as provisional
for assignment and ranking using:

- provisional: `50 + 0.25 * (score - 50)`
- low: `50 + 0.50 * (score - 50)`
- medium: `50 + 0.80 * (score - 50)`
- high: unchanged score

Reviewer tag trust uses the same append-only/Bayesian structure, starting at
5,000 bps. Update it only after final resolution by comparing the review's
criterion claims with the final evidence-backed outcome. Its event score is the
weighted percentage of addressed criterion claims matching that final outcome;
a disproven harmful claim scores 0. Never increment a verified count merely
because a review was submitted.

Discovery quality is the confidence-adjusted skill-quality score, not the
author's reputation. Expose author tag reputation alongside it for consumers
and use author reputation only in assignment. This prevents established authors
from automatically outranking stronger evidence for a particular skill.

An install is the first authenticated content grant redeemed by a unique
principal for a skill version. Raw page views, retries, API keys belonging to
the same principal, and identities in the same cluster do not add adoption.
Ranking counts 1.0 adoption unit for a confirmed, nonrefunded paid/backer grant,
0.25 for a free/promotional grant, and 0 for the author cluster, revoked grants,
or refunded purchases.
Post-use reviewers must have a redeemed grant; their reviews affect reputation
and ranking only. A later verified harmful report may quarantine the affected
version and hold future sale revenue, but cannot claw back a settled RFS bounty.

A post-use review is public immediately as `pending_reputation`. The author may
post one public response and may dispute it with evidence within seven days. If
undisputed, a scheduled job finalizes it and emits reputation events. A disputed
or harmful review enters trusted human moderation; only the final resolution
emits reputation events. Editing a review appends a superseding version and
restarts the window. Allow one active review per identity cluster and skill
version. An author response never changes score by itself.

Discovery first filters by query/tag relevance, then scores candidates:

- 45% confidence-adjusted evidence-backed quality;
- 45% log-normalized unique verified adoption over 180 days, normalized to the
  category's p95 and clamped to [0, 1];
- 10% bounded recency, reaching zero after 180 days.

Use deterministic skill ID as the final tie-breaker. Materialize the components
and serve one cursor-paginated projection to agents and the web UI; do not issue
an RFS lookup per skill at query time. If a category has fewer than 20 eligible
skills, use the snapshotted global p95 for adoption normalization.

### Evidence publication and retention

- The public review projection contains reviewer handle, server-derived role,
  rating/outcome, criterion results, text, public artifact references, redacted
  restricted-evidence summary, SHA-256 hashes, verification status, and final
  resolution. Do not expose principal IDs, wallet addresses, network signals,
  or cluster membership.
- Raw artifacts are encrypted before Convex Storage using AES-256-GCM envelope
  encryption. Store ciphertext, wrapped data key, nonce, authentication tag,
  KMS key version, plaintext hash, ciphertext hash, MIME type, and size. Keep the
  wrapping key outside Convex. Never store plaintext secrets or a master key.
- Default classification is `public`. `restricted` requires an enumerated reason
  such as private source, live exploit, credentials, or coordinated disclosure.
- Restricted access is limited to the author, original backers/requester,
  assigned trusted reviewer/adjudicator, and authorized security operators.
  Log every grant, read, failed read, redaction, and deletion.
- Serve raw artifacts through a controlled download route with a safe MIME
  allowlist and attachment disposition. Never return direct storage URLs.
- Delete restricted ciphertext 180 days after final resolution or disclosure;
  retain hash, metadata, public redaction, decision references, and audit log.

### Money allocation and settlement

For policy v2, `workEscrow` is the advertised author bounty. `reviewReserve` is
added to the funding target and shown separately. The 1% platform fee is
deducted only from released gross author payout.

At final decision:

- `grossAuthor = floor(workEscrow * finalMultiplierBps / 10_000)`
- `platformFee = floor(grossAuthor * 100 / 10_000)`
- `netAuthor = grossAuthor - platformFee`
- `unusedReviewReserve = reviewReserve - confirmedOrCommittedReviewerFees`
- `refundPool = workEscrow - grossAuthor + unusedReviewReserve + slashedBond`

Create immutable obligations for net author payout, platform fee, reviewer
fees, backer refunds, and bond refund/slash. Allocate `refundPool` proportional
to each original confirmed contribution. Use floor division first, distribute
remaining base units by largest remainder, and break equal remainders by stable
contribution ID. The obligation sum must equal the source pools exactly.

Settlement is an outbox, not a client claim. Each transfer snapshots obligation
ID, recipient principal and verified wallet, token, network, amount, policy
version, idempotency key, status (`pending`, `broadcast`, `confirmed`, `failed`,
`cancelled`), attempts, transaction hash, receipt, and timestamps. A scheduled
internal action broadcasts using the configured custody signer and confirms the
receipt before marking an obligation settled. Reconciliation compares external
receipts with pending/broadcast rows. Never accept a client-generated receipt or
mark paid on broadcast alone.

Reviewer fee schedules are policy-versioned and shown before funding. Release a
fee commitment if the assignment expires unperformed. A harmful adjudication
that exceeds the predeclared reserve is paid by a platform risk reserve, never
by silently reducing author payout or contributor refund.

Purchase earnings use repeatable settlement batches and are not attached to the
one-time RFS bounty assessment.

## Target data model

Add fields initially as optional and backfill them before making v2 writes
authoritative. Prefer append-only source tables plus rebuildable projections.

| Table | Key fields and invariants |
|-------|---------------------------|
| `rfs` additions | `policyVersion`, risk tier, work escrow, review reserve, total funding target, funding/application/delivery/revision deadlines, selected application, human-review requirement |
| `rfsRevisions` | immutable draft/contract revisions, criteria/fixture/economic digest, challenged/frozen timestamps, supersession/cancellation event; one current draft before commitment |
| `rfsCriteria` | RFS, stable criterion key, 0-10,000 weight, required flag, objective pass condition, verification method, tags, fixture version; unique by RFS/key; all weights total 10,000 and required weights total at least 6,000 before funding |
| `fixtureVersions` | owner, visibility, SHA-256 manifest/bundle hashes, environment contract, immutable version, storage artifact reference |
| `skills` / `skillVersions` additions | immutable version content and SHA-256 digest; skill row stores metadata, `publishedVersionId`, and quarantine state only |
| `rfsApplications` | RFS, principal, ETA, verification plan, score input snapshot, component scores, total, rank, state, bond requirement; one active application per principal cluster |
| `applicationRevisions` | immutable application payload revisions and withdrawal event, resource version, createdBy/createdAt; final revision freezes at application close |
| `applicationEndorsements` | RFS, application, principal/cluster, role, snapshotted contribution share; one active endorsement per principal |
| `principalWallets` | BetterAuth principal, chain, checksummed address, verification challenge, verified/rotated/revoked timestamps, primary flag |
| `principalSigningKeys` | principal, Ed25519 public key or verified wallet signer, purpose, verified/rotated/revoked interval; never stores an agent private key |
| `publicProfiles` | principal, stable public handle, display name, public bio/links, created/updated timestamps; unique handle; never contains wallet/cluster data |
| `agentDelegations` | BetterAuth API-key reference, permissions/actions, resource/tag allowlists, per-transaction/rolling/lifetime spend caps, token/network, expiry/revocation, spend reservation totals |
| `humanActionRequests` | owner, originating key, typed action, resource/payload digest, requested bounds, status, expiry, resolution actor/session, one-time command/delegation result |
| `accountRecoveryRequests` | principal, prior verified-wallet proof, cooling-off deadline, two operator approvals, key-revocation result, state; no knowledge-based secrets |
| `platformRoles` | principal, role, scope/tags, grantedBy, active interval; trusted reviewer authority is server-derived |
| `identityRiskSignals` | HMAC/pseudonymous signal type, value hash, confidence, observed interval, provenance, expiry; no raw IP or device fingerprint |
| `identityClusters` / memberships | stable cluster, principal, confidence, reasons, active interval, manual override and audit metadata |
| `paymentIntents` | canonical resource, payer principal/wallet snapshot, token/network/amount, reservation, provider challenge, verified receipt, state, expiry, idempotency key |
| `idempotencyRecords` | principal/key identity, API version/action, idempotency key, canonical request digest, result/error/operation reference, expiry; unique by principal/action/key |
| `apiOperations` | command, actor, resource, status, progress/result/error links, cancellation capability, nextPollAt, event sequence; used for asynchronous agent polling |
| `activityEvents` | principal-visible resource event, public-safe summary, capability snapshot/reference, cursor sequence; append-only and indexed by principal/role |
| `accessGrants` | principal, skill/version, source contribution or purchase, active/revoked state; content access is checked here |
| `evidenceArtifacts` | owner, review/RFS/version/criterion links, classification, verification state, hashes, encrypted object metadata, public redaction, retention/deletion state |
| `evidenceAccessEvents` | artifact, actor, action, reason, result, timestamp; append-only |
| `evaluationEvents` additions | phase, server-derived role, cluster snapshot, tag-trust snapshot, policy version, public review projection, no mutable final status |
| `evaluationCriterionResults` | evaluation event, criterion, result, artifact IDs, verifier status; unique by event/criterion |
| `reviewAssignments` | RFS/assessment, trusted reviewer, reason, due time, reserve fee, accepted/completed state |
| `disputes` / `disputeEvents` | trigger, sticky hold, assigned human, evidence links, resolution enum, public rationale, timestamps; append-only events |
| `payoutAssessments` additions | policy version, workflow status, decision kind, passed weight, gross/net/fee/refund totals, `decidedAt`; do not reuse status for settlement |
| `assessmentEvents` | prior/next state, actor, reason, evidence IDs, algorithm inputs/outputs, correlation/job IDs; append-only |
| `bondEscrows` / events | principal, RFS/application, amount, payment receipt, state, fixed slash reason/rate, refund/slash obligations |
| `settlementObligations` | source pool, beneficiary, kind, exact amount, recipient wallet snapshot, decision reference, state |
| `settlementTransfers` | obligation/batch, idempotency key, network/token/amount, status, tx hash, verified receipt, attempts/error |
| `reputationEvents` | subject, tag, source/final decision, score, signal strength, cluster, occurredAt; immutable and unique by source/tag |
| `postUseReviews` / revisions / responses | skill/version/grant/cluster, rating/outcome/tags/text, pending/final/moderation state, evidence links, supersession chain, one author response, final source event |
| `quarantineEvents` | skill/version, triggering evidence/review, prior/next state, sales/purchase-payout holds, safe fallback version, human resolution; append-only |
| `skillQualitySnapshots` / `authorReputationSnapshots` / `reviewerTrustSnapshots` | rebuildable subject/tag score, confidence, counts, computedAt, algorithm version |
| `installEvents` | principal/cluster, skill version, access grant, first redemption; unique by principal/version |
| `discoveryProjection` | skill/version, quality/adoption/recency components, total, confidence/count, category, computedAt; indexed and paginated |

Do not overload one status field with workflow, decision, and transfer state.
Keep those state machines separate and join them in read models.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install exact baseline | `npm ci` | exit 0 |
| Generate Convex types after schema changes | `npx convex codegen` | exit 0 and generated types updated |
| Lint | `npm run lint` | exit 0, no errors |
| Typecheck | `npm run typecheck` | exit 0, no errors |
| Unit/integration tests after Step 1 | `npm test` | all tests pass |
| Production build | `npm run build` | exit 0 |
| End-to-end tests after Step 11 | `npm run test:e2e` | all configured projects pass |
| Diff hygiene | `git diff --check` | no output, exit 0 |

Do not run production Convex deployment, mainnet payment, custody, migration, or
destructive cleanup commands without explicit operator approval.

## Suggested executor toolkit

- Use the `convex` and `convex-best-practices` skills for schema, internal
  functions, scheduling, indexes, and tests.
- Use `better-auth-best-practices` for principal, API-key, and SIWE changes.
- Use `typescript-best-practices` and `principle-type-system-discipline` for all
  tagged unions and state transitions.
- Use `principle-boundary-discipline` for route/auth/payment/evidence parsing.
- Use `principle-prove-it-works` at every phase gate.
- Read official Better Auth API-key docs:
  `https://better-auth.com/docs/plugins/api-key`.
- Read Convex Better Auth local-install guidance before adding schema-bearing
  plugins: `https://labs.convex.dev/better-auth/features/local-install`.
- Read Convex scheduled-functions docs:
  `https://docs.convex.dev/scheduling/scheduled-functions`.
- Use `convex-test` following `https://docs.convex.dev/testing/convex-test`.

## Scope

**In scope** (only these existing paths and named new files):

- `package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `.env.example`,
  `next.config.ts`, new `vitest.config.ts`, and new `playwright.config.ts`
- `convex/schema.ts`, `convex/convex.config.ts`, `convex/auth.ts`,
  `convex/auth.config.ts`, `convex/http.ts`, `convex/users.ts`, `convex/rfs.ts`,
  `convex/contributions.ts`, `convex/purchases.ts`, `convex/evaluations.ts`,
  `convex/payouts.ts`, `convex/skills.ts`, `convex/seeds.ts`
- `convex/lib/validators.ts`, `convex/lib/helpers.ts`
- New `convex/lib/policy.ts`, `convex/lib/assignmentPolicy.ts`,
  `convex/lib/evaluationPolicy.ts`, `convex/lib/reputationPolicy.ts`,
  `convex/lib/money.ts`, `convex/lib/stateMachines.ts`, `convex/lib/authz.ts`
- New `convex/applications.ts`, `convex/criteria.ts`, `convex/evidence.ts`,
  `convex/disputes.ts`, `convex/settlements.ts`, `convex/identityRisk.ts`,
  `convex/reputation.ts`, `convex/ranking.ts`, `convex/migrations.ts`,
  `convex/crons.ts`, `convex/delegations.ts`, `convex/humanActions.ts`,
  `convex/activity.ts`, `convex/publicProfiles.ts`, `convex/idempotency.ts`,
  `convex/operations.ts`, `convex/postUseReviews.ts`,
  `convex/quarantine.ts`, and `convex/accountRecovery.ts`
- Files under new `convex/betterAuth/**` only when created by the official
  Convex Better Auth local-install procedure and reviewed rather than treated as
  opaque generated code
- New test files under `convex/**/*.test.ts`, `src/**/*.test.ts`, and `e2e/**`
- `src/lib/auth-server.ts`, `src/lib/auth-client.ts`, `src/lib/constants.ts`,
  `src/lib/types.ts`, `src/lib/mpp.ts`, `src/lib/view-models.ts`
- New `src/lib/api-auth.ts`, `src/lib/json.ts`, `src/lib/payment-ingestion.ts`,
  `src/lib/evidence-crypto.ts`, `src/lib/settlement-signer.ts`,
  `src/lib/handoff.ts`, and `src/lib/safe-content.ts`
- New schema modules under `src/lib/api-v2/schemas/**`, plus
  `src/lib/api-v2/openapi.ts`,
  `src/lib/api-v2/envelope.ts`, `src/lib/api-v2/errors.ts`,
  `src/lib/api-v2/capabilities.ts`, `src/lib/api-v2/idempotency.ts`,
  `src/lib/api-v2/rate-limit.ts`, `src/lib/api-v2/legacy-routes.ts`, and
  projection modules under
  `src/lib/read-models/**`
- Existing `src/app/api/**` compatibility routes, new `src/app/api/v2/**`, and
  new `src/app/.well-known/oboe-agent.json/route.ts` as named in Step 11
- `src/components/rfs-actions.tsx`, `src/components/new-rfs-form.tsx`,
  `src/components/rfs-row.tsx`, `src/components/status-badge.tsx`, and new
  public/owner/reviewer/operator workflow components named in Step 11
- `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/browse/page.tsx`,
  `src/app/browse/[id]/page.tsx`, `src/app/new/page.tsx`,
  `src/app/me/**`, `src/app/authors/[handle]/page.tsx`,
  `src/app/reviews/[reviewId]/page.tsx`, `src/app/review/**`,
  `src/app/ops/**`, `src/app/sign-in/page.tsx`, and `src/app/docs/page.tsx`
- `docs/superpowers/specs/2026-07-07-agent-evaluation-payout-design.md`,
  `docs/spec.md`, `docs/implementation-plan.md`,
  `docs/backend-integration.md`, `docs/agent-mainnet-e2e.md`,
  `docs/agent-first-user-stories.md`, `README.md`, `public/SKILL.md`,
  `convex/README.md`
- Generated `convex/_generated/**` only via `npx convex codegen`
- `plans/README.md` status update after completion

**Out of scope**:

- A visual redesign, marketing page, token, governance system, on-chain jury,
  universal KYC, or paid ranking boosts.
- Running untrusted skill code in the application, Convex, CI, or a shared
  privileged evaluator host.
- Better Auth Agent Auth until its upstream stability and migration contract are
  suitable for production.
- Retroactive clawback of a finalized RFS bounty based on later reviews.
- More than one fulfillment revision or a general milestone-project manager.
- Mainnet deployment, live custody-key creation, live fund migration, or
  modifying MPP/provider packages in `node_modules`.
- Rewriting unrelated site layout, typography, authentication UI, or seed data.

## Git workflow

- Create branch `johann/complete-evaluation-payout-system` from the intended
  integration base after the drift check.
- Commit one verified phase at a time using Conventional Commits. Suggested
  sequence: `test: establish marketplace lifecycle harness`,
  `feat: add versioned marketplace policy and schema`,
  `fix: secure payment and content boundaries`, then one `feat:` per subsystem.
- Do not combine generated files, schema migration, settlement logic, and UI in
  one commit.
- Do not push, deploy, migrate live data, or open a PR unless instructed.

## Implementation steps

### Step 1: Contain live money writes, freeze v2 policy, and establish tests

1. Add a fail-closed operational kill switch around funding, purchase, and
   payout-claim routes before broader work. It defaults off in production until
   Step 4's trusted ingestion boundary and Step 9's settlement boundary are
   active. Reads and nonmoney local development remain available. Test that no
   MPP challenge is issued while disabled.
2. Add Vitest and `convex-test` as development dependencies and a single
   `npm test` script. Add `npm test` to `.github/workflows/ci.yml` after
   typecheck and before build.
3. Create the versioned policy and pure algorithm modules listed in Scope. They
   must import no Convex, Next.js, network, clock, random, or environment APIs.
   Pass current time and policy explicitly.
4. Represent money and basis points as branded integer types at module
   boundaries. Parse Convex/client integers once; do not cast through `number`
   where values could exceed safe integer range.
5. Implement pure functions for:
   - policy lookup by version and risk tier;
   - criteria validation and payout/revision cap;
   - applicant scoring and deterministic ties;
   - cluster-capped quorum and harmful-hold predicates;
   - fixed bond eligibility/slash matrix;
   - pro-rata largest-remainder allocation;
   - reputation decay, Bayesian score, confidence shrinkage;
   - discovery component scoring;
   - legal workflow transitions for RFS, assessment, dispute, obligation, and
     transfer states.
6. Add table-driven unit tests for every formula and state/event pair before
   wiring database mutations.

**Verify**: `npm test && npm run typecheck && npm run lint` -> all tests pass and
both static checks exit 0.

### Step 2: Add the v2 schema and an inventory-first migration path

1. Extend `convex/schema.ts` with the target tables and indexes. Use tagged
   unions for state-specific fields when Convex validators permit it; otherwise
   enforce the same invariant in one parser at the database boundary.
2. Add `policyVersion` to new RFSs, assessments, events, obligations, and score
   snapshots. Keep new fields optional for legacy rows during the additive
   phase.
3. Create internal migration functions in `convex/migrations.ts`:
   - inventory counts and amounts by legacy status;
   - backfill legacy RFS/assessment rows with `policyVersion: 1`;
   - create missing immutable skill-version references without inventing
     evidence or outcomes;
   - identify synthetic backers, claimed-without-receipt ledgers, unresolved
     disputes, and post-claim purchase entries for operator review;
   - rebuild projections from append-only v2 events.
4. Every migration takes a cursor, processes a bounded batch, records version
   and progress, and is idempotent. Inventory is read-only and runs before any
   write migration.
5. Add an environment-independent feature flag record with `off`, `shadow`,
   `cohort`, and `on` modes. New money-bearing writes remain `off` at this step.
6. Generate Convex types. Do not hand-edit `_generated` files.

**Verify**: `npx convex codegen && npm test && npm run typecheck` -> generation
and tests succeed. Run the inventory function against a local/dev deployment ->
it returns counts and exact base-unit totals without modifying rows.

### Step 3: Anchor sessions, agents, wallets, roles, and clusters to principals

1. Convert the Convex Better Auth component to the documented local install
   before adding schema-bearing plugins. Preserve existing BetterAuth user IDs;
   migration must not mint replacement principals.
2. Add the stable Better Auth API Key plugin with hashed keys, expiration,
   rotation/revocation, per-key rate limits, and explicit permissions:
   `rfs:read`, `rfs:write`, `fund`, `apply`, `submit`, `evaluate`, `purchase`,
   and `settlement:read`. No API key may grant platform roles.
3. Add `agentDelegations` as the authorization layer above raw API-key
   permissions. A delegation constrains actions, resource/tag allowlists,
   token/network, expiry, and per-transaction, rolling-24-hour, and lifetime
   spend. Reserve spend atomically when creating an intent, release it when the
   intent expires or fails, and convert it to consumed spend only from a verified
   receipt. Key scope is the outer ceiling; delegation can only narrow it.
4. Enable API-key session resolution. Implement `src/lib/api-auth.ts` so a route
   accepts either the normal cookie or `x-api-key`, exchanges it for the Convex
   auth token, and passes `{ token }` to every Convex call. Fail closed when no
   principal resolves.
5. Replace syntax-only wallet updates with a signed wallet challenge (SIWE for
   compatible EVM networks). Store multiple verified wallets, rotation history,
   primary status, chain, and immutable wallet snapshots on money obligations.
6. Add rotatable proof-signing public keys linked to the same principal. Require
   an API-key/session-authenticated registration challenge, preserve key history
   for old manifests, and reject signatures made outside a key's active period.
   Agent private keys never enter Oboe storage.
7. Add typed, digest-bound `humanActionRequests` for permission grants, contract
   authorization, bounded spend, wallet verification, high-value assignment,
   adjudication, abandonment, review moderation, pre-broadcast destination
   correction, and legal hold. Creating the request grants no authority. Only a
   recent passkey-authenticated owner/operator session may approve or decline;
   the originating agent can poll status and receive only the bounded result.
8. Add account recovery with two enrolled passkeys as the preferred path. If
   all passkeys are lost, require a signature from a previously verified wallet,
   a 72-hour cooling period, and two independent operator approvals. Completion
   revokes active API/proof keys and never changes a broadcast or confirmed
   transfer destination.
9. Move trusted reviewer/security operator roles into `platformRoles`. All
   Convex mutations derive reviewer role from the principal and active role
   record; remove caller-supplied authority.
10. Add explainable identity-risk signals and clusters. Store HMAC-rotated network
   buckets, payment-wallet linkage, API-key lineage, account age, repeated
   author-reviewer pairs, and timing correlation. Do not store raw IP addresses
   or device fingerprints. Support manual merge/split override with an audit
   event and expiry.
11. Backfill current real users as one-member clusters. Mark synthetic
   `agent:<challenge>` identities unresolved; never automatically merge them
   without a verified payment-wallet proof.

**Verify**: `npm test -- auth identity` -> tests prove cookie and API-key calls
resolve to the same principal, revoked keys fail, wallet signatures are checked,
roles cannot be self-asserted, delegation ceilings cannot be widened, concurrent
intents cannot overspend a delegated budget, human-action references confer no
authority, recovery requires the stated factors/cooling/approvals, and two
principals in one cluster count once.
Then run `npm run typecheck && npm run lint` -> exit 0.

### Step 4: Secure payment ingestion and content authorization

1. Create a canonical `paymentIntent` before issuing an MPP challenge. Atomically
   reserve the requested amount against remaining RFS capacity so concurrent
   contributors cannot both be charged for the last available amount. Permit one
   active intent per principal/resource and release its reservation idempotently
   after 10 minutes.
2. Bind intent ID, resource, principal, verified wallet, token, network, exact
   amount, expiry, and idempotency key into the challenge. After payment, ingest
   only a provider/chain-verifiable receipt for that exact intent.
3. Make `contributions.recordContribution` and purchase-recording writes
   internal. The Next MPP adapter may reach them only through a server-authenticated
   action that verifies a short-lived signed envelope and the provider receipt.
   Direct Convex callers must be unable to assert payment facts.
4. If a valid late receipt arrives after capacity changed, record it and create
   a refund obligation. Never reject a payment that external state proves was
   settled without also recording the liability.
5. Make invalid or zero escrow addresses fatal configuration errors in
   `src/lib/mpp.ts`; remove fallback addresses.
6. Require a principal and verified payment/refund wallet for RFS funding and
   skill purchase. API-key agents use the same routes as browsers.
7. Split public metadata DTOs from protected content DTOs. Public Convex queries
   never return skill content or evaluation-stage submissions. Authorize content
   in Convex through author, original-backer, evaluator assignment, or purchase
   `accessGrant`, not only in a Next route.
8. Separate one-time bounty settlement from repeatable purchase-earning batches.
9. Centralize bigint-to-decimal-string JSON conversion in `src/lib/json.ts` or
   `src/app/api/_lib/responses.ts` and apply it to every Convex-backed route.

**Verify**: `npm test -- payment content json` -> tests prove forged direct
writes fail, amount/token/resource mismatches fail, duplicate receipts create
one contribution, a concurrent overfund race preserves every paid unit as
funding or refund, unauthorized content reads fail, authorized reads succeed,
and detail routes serialize bigint as decimal strings. Then run all baseline
checks.

### Step 5: Make criteria, fixtures, funding, and deadlines contractual

1. Add a read-only RFS preflight that validates the draft, queries the shared
   catalog projection for similar published skills and open RFSs, and returns
   candidate links plus explainable similarity components. Continuing requires
   the requester to record considered item IDs and a concise unmet-gap reason;
   similarity advises and never silently blocks a distinct request.
2. Extend RFS creation DTOs and `convex/rfs.ts` to require criteria and expose
   work escrow, review reserve, total funding target, policy version, risk tier,
   and deadlines separately.
3. Validate at creation and before first payment intent that criteria are
   unique, objective, nonempty, independently testable, include at least one
   required item, and total 10,000 bps. Reject later edits.
4. Store every draft in append-only `rfsRevisions`. Before any challenged
   payment intent, the requester may append a corrected revision or cancel.
   The first intent freezes its referenced revision and digest. A later revision
   is allowed only after all intents for the frozen revision expire unpaid and
   reservations release. After a contribution, cancellation follows the state
   machine and first creates complete refund obligations.
5. Add standard/requester fixture versions. Hash manifests and bundles with
   SHA-256, never FNV. Preserve FNV only as a named legacy digest if needed for
   policy-v1 reads.
6. Schedule funding expiry when the RFS opens. If the target is not reached by
   the deadline, cancel and create full contribution refund obligations. If it
   reaches the target, open the policy-selected application window.
7. Snapshot all policy/economic values and contract digest before issuing the
   first payment intent so a future policy change cannot alter a payer's terms.
8. Add public read models that show work bounty, reviewer reserve, funded amount,
   deadlines, criteria, fixture hashes, and policy version without protected
   content.

**Verify**: `npm test -- criteria funding fixture deadline` -> tests cover weight
sum boundaries, preflight similarity with an allowed documented override,
append-only draft amendment/cancellation boundaries, immutable challenged
revision and SHA-256 binding, funded/cancelled races, scheduled expiry
idempotency, and exact full-refund obligations.

### Step 6: Replace first-come claim with scored applications and bonds

1. Deprecate direct `convex/rfs.claim` for policy v2. It may remain only behind
   the policy-v1 compatibility path until no v1 RFS is assignable.
2. Expose an eligibility preflight with stable reason codes for application
   window, requester/applicant cluster exclusion, active restrictions, verified
   payout wallet, one-active-application rule, and bond acknowledgement. It must
   reveal no private risk signal or competing applicant data.
3. Implement create/revise/withdraw application mutations while the window is
   open. Each correction appends an immutable `applicationRevision`; withdrawal
   appends an event and releases only uncommitted reservations. Freeze the final
   active revision at close. Enforce one active application per principal
   cluster, verified payout wallet, ETA, criterion coverage, and
   requester/applicant-cluster exclusion rules.
4. Implement endorsements. Snapshot requester endorsement and contribution
   shares at close; cap correlated identities and exclude the applicant cluster
   from its own backer support. An endorsement changes only the 5% component and
   cannot force eligibility or selection.
5. At the deadline, compute and persist every score component and tie-break.
   Select deterministically. Never query live reputation during later display;
   show the assignment snapshot.
6. For a high-value low-reputation winner, create the bond payment intent and a
   provisional assignment. Finalize assignment only after confirmed bond
   escrow. On timeout, offer the next ranked candidate.
7. Queue high-value human eligibility confirmation through a digest-bound
   `humanActionRequest`. A rejection must use an
   enumerated disqualifying reason and advance to the next ranked candidate.
8. If no candidate remains, schedule one application-window retry, then cancel
   and create full refunds after the second empty close.
9. Schedule delivery expiry and 24-hour grace. Missing a deadline opens human
   abandonment review; it does not auto-slash.

**Verify**: `npm test -- application assignment bond` -> deterministic fixtures
prove eligibility reason codes, immutable revisions and withdrawal cutoffs,
score weights, confidence shrinkage, endorsement cap, tie order, neutral
new-author prior, bond trigger/nontrigger, human-action binding,
next-candidate fallback, and absence of requester veto. Assert no policy-v2
route calls `rfs.claim`.

### Step 7: Build the evidence vault and reproducible proof workflow

1. Add authenticated artifact upload intents linked to an RFS, criterion, skill
   version, and evaluation draft. Validate size and a strict MIME allowlist.
2. Encrypt every raw artifact before storage using a random data key and
   AES-256-GCM. Wrap the data key through the configured KMS/key provider. Store
   only ciphertext and envelope metadata in Convex. Hash plaintext and
   ciphertext with SHA-256.
3. Validate proof manifests at the boundary and verify their signature against
   the principal's active key. Reject stale skill versions, mismatched hashes,
   mutable fixture references, replayed manifests, and expired proof windows.
4. Implement verifier jobs that mark artifacts verified only after a standard
   fixture service or assigned reviewer independently confirms the result. Do
   not let the submitting reviewer set verification state.
5. Quarantine uploads until a MIME/content and malware scan passes. A scan
   decides whether an artifact may be served, not whether its evidence is true.
   On scanner failure, keep the object inaccessible and alert; never fail open.
6. Create separate public review projections and restricted artifact records.
   Public is default. Restricted classification requires an enumerated reason
   and a redacted public summary.
7. Implement controlled download/decryption routes and append every access result
   to `evidenceAccessEvents`. Return attachments, not executable inline content
   or direct storage URLs.
8. Schedule restricted-artifact deletion at retention expiry and add a daily
   reconciliation job. Legal holds suspend deletion with an audited role action.

**Verify**: `npm test -- evidence` -> tests cover encryption round-trip,
tampering, wrong key version, signature and hash mismatch, replay, ACL matrix,
public/restricted defaults, audit events, redaction requirement, and idempotent
retention deletion. No test prints plaintext evidence or keys.

### Step 8: Implement criterion evaluation, quorum, revision, and adjudication

1. Replace the current mixed close logic with the pure policy functions from
   Step 1. Mutations validate inputs, load snapshots, invoke pure logic, and
   append events; they do not reimplement formulas.
2. Evaluation submission records per-criterion results and artifact IDs. Derive
   principal, role, cluster, eligibility, tag trust, and phase server-side.
   Remove client authority over `reviewerType`, payout weight, evidence strength,
   or scoring confidence.
3. Deduplicate one active payout-window evaluation per cluster and skill version.
   Add an explicit correction command that appends a superseding event before
   closure, preserves the original public/audit trail, and restarts verification
   only for changed claims. It never edits or deletes an evaluation.
4. Implement cluster-capped acceptance and reduction quorum exactly as specified.
   Freeform events remain visible but have zero payout effect.
5. On a qualifying harmful event, atomically create a sticky hold, set the
   assessment to human review, prevent publication/settlement, and create a
   funded trusted-review assignment.
6. Give trusted reviewers a bounded assignment queue and explicit accept,
   conflict-decline, workspace-access, and complete commands. Assignment access
   expires; acceptance snapshots scope, exact version, fixtures, due time, fee,
   and independence result. Completion cannot self-mark evidence verified.
7. Implement first-class dispute assignment and trusted-human resolution. Check
   role, conflict declaration, artifact access, and fixed resolution/slash enums.
   Permit eligible parties to append evidence while open, but only the assigned
   recent-passkey human may append the resolution. Append the full decision
   trail and public redaction.
8. Implement the single revision. Supersede the first assessment, retain its
   events, bind the new skill version with SHA-256, schedule its deadline, and
   apply the 90% ceiling at final decision whether the revision is completed,
   declined, or missed.
9. Schedule evaluation closure and one extension. Add a 15-minute reconciliation
   cron over due indexed states. Insufficient evidence assigns a trusted reviewer
   and holds funds; it never defaults to full payout.
10. Keep `skillVersions` immutable and make `skills` a metadata/read projection.
   Set its `publishedVersionId` only after a publishable final decision; never
   copy unreviewed or rejected content into a public skill row.
11. Write author/reviewer reputation source events only after a final decision.

**Verify**: `npm test -- evaluation quorum harmful dispute revision scheduler`
-> tests prove correction supersession, assignment accept/conflict/expiry,
no-review hold, acceptance threshold, two-cluster reduction, same-cluster cap,
required reproducible proof, sticky harmful hold, no unilateral block,
mandatory high-value human resolution, append-only dispute evidence, dispute
exit, one revision, 90% ceiling, supersession, and idempotent scheduled closure.

### Step 9: Create exact obligations and receipt-backed settlement

1. At final decision, use the pure money module to calculate gross author,
   platform fee, net author, used/unused review reserve, bond outcome, and refund
   pool. Persist immutable assessment inputs and totals.
2. Create one obligation row per beneficiary/kind. Generate per-contribution
   refunds using largest remainder and aggregate only after allocation so the
   audit trail still proves each contributor's share.
3. Replace the client payout-claim route with a read/status or enqueue route.
   Clients never submit `claimGroupId`, receipt, amount, destination, or state.
4. Implement the settlement outbox and scheduled internal worker. Use a signer
   adapter with a fake implementation in tests and a production custody/KMS
   implementation selected at the server boundary. Do not store a raw custody
   private key in Convex.
5. Status transitions are `pending -> broadcast -> confirmed` or retryable
   `failed`; use the stable obligation ID as idempotency source. Verify network,
   token, sender, recipient, amount, tx status, and confirmation depth before
   `confirmed`.
6. Reserve a custody-provider idempotency key or sender nonce before broadcast.
   If the broadcast response is lost, reconcile that key/nonce before attempting
   another transaction; never create a second payment merely because no tx hash
   was returned.
7. Add reconciliation for broadcasts with missing callbacks, duplicate receipts,
   replaced/failed transactions, and wallet rotation. A transfer always uses its
   immutable recipient snapshot unless an authorized pre-broadcast correction
   completes a digest-bound human action and appends an audit event. A correction
   cannot affect `broadcast` or `confirmed` transfers.
8. Implement repeatable purchase payout batches so earnings after one batch are
   claimable in the next.
9. Expose principal-scoped obligation and earnings projections with source,
   beneficiary, amount, immutable destination summary, decision, transfer state,
   failure code, and next polling time. Emit principal activity events for every
   obligation and settlement transition without exposing custody details.

**Verify**: `npm test -- money refund settlement purchase-payout` -> property
tests prove conservation for varied contribution/rounding inputs; integration
tests prove no confirmation without receipt, duplicate worker runs send once,
failed transactions retry safely, refund+bounty+fee+reviewer+bond obligations
equal source funds, and later purchase batches settle. Use only the fake signer.

### Step 10: Build resolved-event reputation, downstream reviews, and ranking

1. Implement append-only reputation events and rebuildable
   skill-quality, author-reputation, and reviewer-trust snapshots with the exact
   decay, prior, confidence, and shrinkage formulas.
2. Backfill only facts that existing finalized records prove. Mark legacy
   aggregates as policy-v1 historical context; do not fabricate criterion proof,
   reviewer correctness, installs, or confidence.
3. Create access-grant redemption/install events. Deduplicate by principal and
   skill version; cluster them for aggregate adoption and apply the paid/free,
   author-cluster, refund, and revocation weights defined above.
4. Add post-use review submission for authenticated redeemed grants. Support a
   simple rating, outcome, text, criterion-like tags, and optional evidence.
   Label phase `post_publish` and enforce reputation-only payout impact. Add the
   seven-day finalization window, one public author response, superseding edits,
   and evidence-backed trusted moderation for disputed/harmful reviews.
5. A verified later harmful report quarantines the affected version, pauses new
   sales and future purchase payouts, and opens human review. Serve the latest
   prior nonquarantined version when contractually valid; otherwise pause access.
6. Materialize the discovery projection and refresh it after final reputation,
   install, purchase, quarantine, or version events. Add cursor indexes and one
   shared query for web and agent clients.
7. Return score components, confidence label, and independent count in public
   DTOs, with skill quality and author reputation labeled separately. Never
   expose risk signals or clusters.
8. Materialize public author profiles, stable review deep-link projections, and
   explainable reputation event summaries. Show which finalized source changed
   a score, its tag/version, signal strength class, age/decay, and resulting
   confidence without exposing reviewer clusters or internal risk signals.
9. Emit principal activity events for install, post-use review, response,
   dispute, moderation, quarantine, and reputation-finalization transitions so
   an interrupted agent or owner dashboard can resume from one cursor.

**Verify**: `npm test -- reputation install review ranking quarantine` -> fixed
clock tests prove 365-day half-life and 10% floor, Bayesian prior, confidence
bands, low-confidence shrinkage, one install per principal/version, no payout
change from post-use reviews, balanced 45/45/10 ranking, deterministic ties, and
quarantine behavior. Include a pagination test proving no N+1 RFS reads.

### Step 11: Expose complete agent and human workflows

#### 11A. Publish one versioned agent protocol

1. Treat the current unversioned `/api/**` surface as policy-v1 compatibility
   only. It may read or finish existing v1 resources but cannot create or mutate
   policy-v2 resources. Put every new contract under `/api/v2`; do not alias v2
   writes through an unversioned route. Centralize every old marketplace
   method/path and its successor in `src/lib/api-v2/legacy-routes.ts`.
   During the compatibility window, every successful legacy response includes
   `Deprecation`, `Sunset`, and successor `Link` headers plus safe envelope
   metadata. Legacy creation and commands with no in-flight-v1 requirement return
   `410 api_version_retired` as soon as their v2 successor is enabled. Only
   resource-specific operations required to finish an existing v1 lifecycle may
   still execute before the cutoff; any v1 request targeting a v2 resource is
   refused with its successor link. Framework-owned `/api/auth/**` callbacks are
   not marketplace API v1 and are exempt.
2. Add `zod` as a direct dependency and define every v2 request, response,
   error, capability, event, and operation schema in
   `src/lib/api-v2/schemas/**`. Assemble OpenAPI 3.1 from those runtime schemas
   with Zod 4 `z.toJSONSchema`. Continue using Convex `v` validators internally,
   with shared fixtures that prove both boundaries accept and reject the same
   canonical examples.
3. Publish `GET /.well-known/oboe-agent.json` and
   `GET /api/v2/openapi.json`. Discovery declares base URL, active and sunset
   versions, auth methods, permissions, payment/token/network support, schema
   links, safety rules, status vocabulary, and deprecation dates. Do not finalize
   or advertise `public/SKILL.md` as a v2 guide here: treat the current file as
   v1 compatibility while v2 is disabled, then replace it from the implemented
   contract in Step 13.
4. Implement one route wrapper for cookie/API-key resolution, permission and
   delegation checks, CSRF/origin enforcement for cookie mutations, request ID,
   idempotency, conditional mutation, rate-limit headers, decimal-string money,
   stable errors, and response schema validation. Human/operator commands reject
   API keys and require a recent passkey session.
5. Add public catalog resources:
   - `GET /api/v2/catalog`, `/skills`, `/skills/{skillId}`,
     `/skills/{skillId}/versions/{versionId}`, `/authors/{handle}`, and
     `/reviews/{reviewId}`;
   - `GET /api/v2/rfs` and `/rfs/{rfsId}`;
   - `GET /api/v2/skills/{skillId}/installs` returns aggregate adoption only;
   - `POST /api/v2/skills/{skillId}/purchase-intents` and authenticated
     `GET /api/v2/skills/{skillId}/versions/{versionId}/content` redeem access
     and record a first install internally.
6. Add complete RFS command/query resources:
   - `POST /api/v2/rfs/validate`, `/similar`, and `/rfs`; `GET/PATCH/DELETE`
     `/api/v2/rfs/{rfsId}` append a permitted draft revision or cancellation;
   - `GET /api/v2/rfs/{rfsId}/revisions`, `POST .../funding-intents`,
     `GET .../applications/eligibility`, `GET/POST .../applications`, and
     `POST .../applications/{applicationId}/revisions`,
     `POST .../applications/{applicationId}/withdraw`, and
     `POST .../applications/{applicationId}/endorse`;
   - `GET .../assignment`, `POST .../bond-intents`, `POST .../submissions`,
     and `GET .../evaluation-workspace`;
   - `GET/POST .../evaluations`, `POST .../evaluations/{evaluationId}/supersede`,
     `POST .../evidence/upload-intents`, `GET .../evidence`,
     `GET/POST .../disputes`, `POST .../disputes/{disputeId}/evidence`,
     `GET .../events`, and `GET .../settlement`.
7. Add evaluator, review, owner, and recovery resources:
   - `GET /api/v2/review-assignments`,
     `POST /api/v2/review-assignments/{id}/accept`,
     `POST /api/v2/review-assignments/{id}/decline`, and
     `POST /api/v2/review-assignments/{id}/complete`;
   - `GET/POST /api/v2/skills/{skillId}/reviews`,
     `POST .../reviews/{reviewId}/revisions`,
     `POST .../reviews/{reviewId}/response`, and
     `POST .../reviews/{reviewId}/dispute`;
   - `GET /api/v2/me/work`, `/activity`, `/obligations`, `/earnings`,
     `/reputation`, and `/human-actions/{actionId}`;
   - session-only `GET/POST /api/v2/me/agent-keys`, `/delegations`,
     `/wallet-challenges`, `/wallets`, `/recovery`, and
     `POST /api/v2/me/human-actions/{actionId}/approve` and
     `POST /api/v2/me/human-actions/{actionId}/decline`.
   Generic approve/decline applies only to approval-shaped action types.
   Adjudication, moderation, abandonment, legal hold, and destination correction
   complete through their fixed role-gated command and merely update the linked
   human-action status; they cannot be reduced to a generic approval.
   Role, cluster, review resolution, payment receipt, transfer state, and
   evidence verification are never accepted as client authority.
8. Build general capability descriptors into every actionable resource, not
   just RFSs. Each capability names action, method/path, required permission,
   preconditions, current resource version, idempotency requirement, human gate,
   and expiry. Capability presence is authoritative; clients do not reconstruct
   state machines from booleans.
9. Add `idempotencyRecords` and `apiOperations` to support unreliable clients.
   Every write accepts `Idempotency-Key`; state-sensitive writes also require
   `If-Match`. Long-running commands return `202` with an operation resource.
   Polling is side-effect free and returns `ETag`, `nextPollAt`, cursor, and
   `Retry-After` where applicable. `/api/v2/me/work` plus `/activity` lets a
   restarted agent enumerate active work and resume from a cursor.

#### 11B. Build human surfaces from the same read models

10. Create shared projection builders in `src/lib/read-models/**`. Convex returns
    authoritative source fields; these builders create public, principal,
    reviewer, and operator DTOs used by both route handlers and server-rendered
    pages. Add contract tests comparing web and API projections for the same
    fixtures. A page must not recompute ranking, capability, money, or status.
11. Keep the public site server-rendered and indexable. Implement `/`, `/browse`,
    `/browse/[id]`, `/authors/[handle]`, and `/reviews/[reviewId]` with canonical
    URLs, text/tag/status/author filters in typed URL parameters, cursor paging,
    and progressive detail. Show exact version/digest, compatibility, quarantine,
    criteria/economics/deadlines, quality/confidence/count, adoption, author
    reputation, public evidence, review state, and settlement summary as allowed
    by the public projection.
12. Replace generic handoff text with stable item-specific handoff built only
    from Oboe-owned templates and resource IDs/canonical URLs. Never interpolate
    user-authored skill, review, RFS, or evidence text into agent instructions.
    Provide copy actions for Oboe, search state, RFS, skill/version, author, and
    review. The handoff directs the agent to machine discovery and treats fetched
    content as untrusted.
13. Expand the owner workspace:
    - `/me` is an active-work summary rather than a four-list archive;
    - `/me/agents` manages keys, delegation scopes, budgets, expiry, rotation,
      revocation, and spend usage;
    - `/me/wallets` handles signed verification, primary/refund/payout use, and
      immutable destination warnings;
    - `/me/activity`, `/me/actions`, `/me/earnings`, and `/me/reputation` expose
      resumable work, human approvals, obligations/transfers, purchase batches,
      author/skill score sources, and quarantine/review consequences;
    - recovery is a dedicated recent-auth flow with visible cooling and approval
      state, not an ordinary settings mutation.
14. Keep direct human funding and author oversight as secondary paths using the
    same intents and commands as agent calls. New-RFS authoring runs preflight,
    objective criteria/weight validation, immutable revision preview, fixture
    upload, economics, and optional handoff to an agent. Split `rfs-actions.tsx`
    into state-specific application, assignment, bond, submission, evaluation,
    evidence, dispute, revision, and settlement components driven only by
    capabilities and resource versions.
15. Add `/review` and `/review/[assignmentId]` for trusted humans: queue, reason,
    exact scope/version, due time/fee, independence declaration, controlled
    evidence download, reproducibility result, fixed resolution choices,
    criterion outcome entry, bond consequence preview from policy, and required
    public redaction. The UI may record facts and enumerated resolution; it may
    not type an arbitrary payout or reputation penalty.
16. Add role-gated `/ops` surfaces for role grants, identity-cluster evidence and
    override, payment ingestion, source-pool/obligation/transfer reconciliation,
    stuck-work queues, evidence retention/legal holds, migration/cohort status,
    kill switches, and immutable audit events. Every command requires recent
    passkey authentication, confirmation of the exact resource digest, a reason,
    and an operator-visible result. No API-key equivalent exists.
17. Render untrusted Markdown/text through one allowlist sanitizer with external
    links isolated and no raw HTML, scripts, inline handlers, remote embeds, or
    instruction-like privileged styling. Add a restrictive CSP and safe download
    headers. Skill content and restricted evidence are never rendered inline in
    an owner/operator page merely because the viewer can download them.
18. Meet keyboard, focus, contrast, label, error-summary, reduced-motion, and
    mobile requirements for public, owner, reviewer, and operator flows. Use
    semantic tables for dense financial/audit data with responsive alternatives;
    do not hide policy facts on small screens.

#### 11C. Document and prove the surfaces

19. Replace the hand-maintained route inventory in `/docs` with generated or
    schema-linked v2 documentation and clearly label v1 compatibility/sunset.
    Update the authoritative design spec, backend/E2E/operator/migration/reviewer/
    evidence-retention/settlement runbooks, and mark conflicts superseded. Defer
    the agent-facing task guide and its examples to Step 13, after route and
    lifecycle behavior are stable.
20. Add `@playwright/test`, `npm run test:e2e`, and a configuration that boots an
    isolated nonproduction app/Convex environment. Cover API-key and browser
    paths, delegation overspend, human-action approval/decline, restart/resume,
    stale `If-Match`, duplicate idempotency, draft/application/evaluation
    supersession, harmful hold, reviewer resolution, partial refund, recovery,
    public profile/review links, and v1/v2 isolation.
21. Add automated accessibility checks plus keyboard-only and desktop/mobile
    screenshot tests for public discovery, owner approval, reviewer adjudication,
    and operator reconciliation. Include CSP/CSRF, untrusted-content rendering,
    public/private projection, and API/OpenAPI schema conformance as separate CI
    checks. Unit CI uses fake payment/signing/KMS providers and no custody secret.

**Verify**: `npm run test:e2e && npm test && npm run lint && npm run typecheck && npm run build`
-> every command exits 0. Validate the published OpenAPI document against every
contract fixture, prove every user-story row in the companion traceability
matrix has a protocol/UI test or an explicit intentional asymmetry, and inspect
desktop/mobile screenshots for overlaps, clipped values, inaccessible controls,
or actions that contradict returned capabilities.

### Step 12: Roll out by immutable cohort with reconciliation and rollback

1. Run the read-only inventory in each environment and save counts/base-unit
   totals outside the repo. Reconcile them with provider/custody data before any
   write migration.
2. Backfill `policyVersion: 1` and additive references in bounded idempotent
   batches. Existing finalized payouts remain untouched. Existing in-flight v1
   RFSs continue through the hardened v1 path and are never recalculated with v2.
3. Deploy v2 in `shadow`: compute assignment/evaluation/reputation decisions but
   do not act on them. Compare component snapshots and invariant violations for
   at least one complete dev/test lifecycle.
4. Enable a test cohort of new, low-value RFSs. Settlement uses testnet and a
   fake or operator-approved nonproduction signer. Confirm all obligations and
   external receipts reconcile.
5. Expand to medium value only after zero unexplained money-conservation,
   duplicate-transfer, auth-bypass, stuck-dispute, or evidence-ACL incidents.
6. Validate a restricted high-value cohort only after trusted reviewer staffing,
   KMS/custody, monitoring, and dispute runbooks are operational and an explicit
   operator approves the gate. Keep general v2 availability disabled until the
   final agent guide and guide-driven E2E gate in Step 13 pass.
7. Rollback disables new v2 RFS creation and worker broadcasting while preserving
   all existing rows and holds. Never roll back by deleting events or reverting
   already-confirmed transfers.
8. Add alerts for overdue applications/evaluations/revisions/disputes, stale
   broadcasts, failed receipts, obligation imbalance, missing wallet snapshots,
   evidence retention failures, unresolved harmful holds, and projection lag.
9. After no policy-v1 RFS remains open and all v1 liabilities reconcile, retire
   every unversioned marketplace route. Keep a small tombstone handler at each
   published old method/path instead of serving old behavior or falling through
   to an unexplained `404`. A retired route returns `410 Gone` with stable code
   `api_version_retired`, a concise message naming v2, and links containing the
   replacement method/path, OpenAPI document, migration guide, and sunset date.
   It performs no Convex query/mutation, payment challenge, storage read, or
   redirect. In particular, never redirect a write because method, body,
   idempotency, authentication, and payment semantics changed.
10. Cover all current business routes in the retirement map: skill catalog,
    skill detail/content, RFS create/detail, funding, claim/application,
    submission, evaluation/list/close, dispute, payout claim, and wallet
    management. Where no one-for-one command exists, point to the containing v2
    resource and capability: old `claim` points to application eligibility and
    application creation; old evaluation `close` states that closure is
    scheduled; old payout `claim` points to settlement/obligations status. Keep
    tombstones through the documented retirement period; remove them only in a
    later cleanup after telemetry shows no callers and all published guidance is
    v2-only.

    The initial exact successor map is:
    - `GET /api/skills` -> `GET /api/v2/catalog`;
    - `GET /api/skills/{id}` -> `GET /api/v2/skills/{id}`;
    - `GET /api/skills/{id}/content` -> first
      `GET /api/v2/skills/{id}`, then follow its exact-version purchase/content
      capability;
    - `POST /api/rfs` -> `POST /api/v2/rfs`;
    - `GET /api/rfs/{id}` -> `GET /api/v2/rfs/{id}`;
    - `POST /api/rfs/{id}/fund` ->
      `POST /api/v2/rfs/{id}/funding-intents`;
    - `POST /api/rfs/{id}/claim` -> first
      `GET /api/v2/rfs/{id}/applications/eligibility`, then
      `POST /api/v2/rfs/{id}/applications`;
    - `POST /api/rfs/{id}/submit` ->
      `POST /api/v2/rfs/{id}/submissions`;
    - `GET /api/rfs/{id}/evaluation` ->
      `GET /api/v2/rfs/{id}/evaluation-workspace`;
    - `POST /api/rfs/{id}/evaluations` ->
      `POST /api/v2/rfs/{id}/evaluations`;
    - `POST /api/rfs/{id}/evaluation/close` -> no replacement command; use
      `GET /api/v2/rfs/{id}` and its event/poll links because closure is
      scheduler-owned;
    - `POST /api/rfs/{id}/dispute` ->
      `POST /api/v2/rfs/{id}/disputes`;
    - `POST /api/rfs/{id}/payout/claim` -> no replacement command; use
      `GET /api/v2/rfs/{id}/settlement` or `GET /api/v2/me/obligations`;
    - `POST /api/me/wallet` -> first
      `POST /api/v2/me/wallet-challenges`, then complete verified-wallet setup.

**Verify**: run the documented inventory and reconciliation commands in dev/test
-> source pools equal obligations and confirmed external transfers, with zero
unexplained rows. Exercise every legacy method/path before and after the cutoff:
the compatibility phase is visibly deprecated and v1-only; the retirement phase
returns its exact `410` successor response and invokes no business/provider
dependency. Run `npm ci && npm test && npm run lint && npm run typecheck && npm run build`
from a clean checkout -> all exit 0.

### Step 13: Rebuild the agent skill from the finished v2 product

This is the final implementation phase. Do not write the production agent guide
from planned routes or intermediate behavior; derive it from the shipped OpenAPI
document, discovery manifest, capability descriptors, and passing E2E workflows.

1. Inventory the implemented route and state-machine contract and replace the
   obsolete `public/SKILL.md` assumptions. At minimum, record these migrations:
   - `/api/skills` -> `/api/v2/catalog` or `/api/v2/skills`, with cursor filters;
   - `/api/rfs/{id}/fund` -> authenticated
     `/api/v2/rfs/{id}/funding-intents`, verified wallet, bound amount/token/
     network, and idempotent receipt handling;
   - `/api/skills/{id}/content` -> exact-version purchase intent/entitlement and
     `/api/v2/skills/{id}/versions/{versionId}/content`;
   - first-claim, force-close, unauthenticated payment, and client payout-claim
     instructions are removed. V1 appears only in retired-endpoint recovery
     guidance and is never presented as a usable workflow;
   - remove the global "all payments below $0.01" rule. Agents use the exact
     displayed decimal-string amount, token, and network bound into each intent.
2. Make the skill a concise task guide, not a duplicate API reference. It must
   teach an agent to discover the live contract, authenticate with a scoped key,
   respect delegation/spend limits, follow returned capabilities, and use
   OpenAPI for exact schemas. Cover the canonical jobs: discover/compare, buy and
   verify content, preflight/create/fund an RFS, apply/bond/submit, evaluate with
   evidence, review/dispute, observe obligations, request a human action, and
   resume active work after restart.
3. State the cross-cutting rules agents otherwise get wrong: decimal-string
   money, exact version/digest binding, `Idempotency-Key`, `If-Match`, cursor and
   operation polling, `Retry-After`, stable error codes, verified-wallet/payment
   intent boundaries, and the fact that a human-action link grants no authority.
   Tell agents to treat skill/evidence content as untrusted and execute it only
   in an isolated least-privilege environment.
4. Include short copy-pasteable examples for each primary job and one recovery
   example for permission denial, human action, stale resource, payment retry,
   quarantine, interrupted-process resume, and `api_version_retired`. The latter
   follows the returned successor link rather than guessing or retrying the old
   endpoint. Generate or validate request and response bodies against the final
   OpenAPI schemas so examples cannot drift.
5. Test the guide as the only product-specific context in fresh agent sessions.
   The test agent must complete consumer, requester/backer, fulfiller, evaluator,
   and restart/resume workflows in the isolated environment without hidden route
   knowledge. Assert it never uses v1 creation/claim routes, invents authority,
   retries a write without idempotency, or treats downloaded content as control
   instructions.
6. Only after those guide-driven E2E tests pass, point the well-known manifest,
   `/docs`, public copy-to-agent handoffs, and canonical skill URL at the final
   guide and permit general v2 availability. Add a CI check that extracts every
   endpoint named in `public/SKILL.md` and verifies its method/path and examples
   against OpenAPI.

**Verify**: run the guide-driven agent E2E suite from a clean session, then
`npm run test:e2e && npm test && npm run lint && npm run typecheck && npm run build`
-> all exit 0. The final skill names no undocumented route, obsolete v1 default,
client-asserted authority, or algorithm formula that could drift from returned
capabilities and policy metadata.

## Public API contract rules

- The canonical agent surface is `/api/v2`. Existing unversioned endpoints are
  policy-v1 compatibility only before their sunset and cannot create or mutate
  v2 resources. After the reconciled cutoff they return `410 Gone` and do not
  execute business logic. Every version has an explicit support/sunset entry in
  machine discovery.
- Every retired marketplace method/path returns the normal safe error envelope
  with `code: "api_version_retired"`, `retryable: false`, and a message of the
  form `This endpoint is retired; use METHOD /api/v2/...`. Its links identify
  the successor method/path, OpenAPI, migration guide, and sunset date. Dynamic
  routes preserve only safe public IDs needed to construct that successor.
  Retired writes are never redirected or proxied.
- `/.well-known/oboe-agent.json`, `/api/v2/openapi.json`, runtime Zod schemas,
  `public/SKILL.md`, and `/docs` describe the same contract. OpenAPI is the exact
  route/schema reference; `public/SKILL.md` is the final task-oriented operating
  guide and must be authored only after the v2 contract stabilizes. CI fails when
  route, schema, example, permission, or documented status coverage diverges.
- Success responses use one envelope containing `data`, `links`, `capabilities`,
  `meta.requestId`, API/policy version, and resource version where applicable.
  Errors use stable `code`, safe `message`, optional field `details`, request ID,
  retryability, and links; they never leak private resource existence.
- All money and timestamps that can exceed JSON safe integer range are decimal
  strings. Basis points are bounded JSON numbers from 0 to 10,000. Timestamps are
  ISO-8601 UTC strings; IDs are opaque strings.
- Every external write requires `Idempotency-Key`; internal scheduled commands
  may derive one from an immutable source.
  A replay returns the original result; a key reused with different payload gets
  `409`. A state-sensitive write requires `If-Match`; stale resource versions
  return a conflict containing the safe current version and refresh link.
- API clients submit intent and evidence, not authority. They never submit role,
  cluster, trust, payout multiplier, decision status, transfer receipt, or
  verification state.
- Every actionable response includes stable resource IDs, policy/algorithm
  version, separate workflow/decision/settlement states, and authoritative
  capability descriptors. A capability states permission, precondition,
  method/path, expiry, idempotency, and any human gate.
- Long-running work returns `202` plus an operation resource. Queries and
  operation polls are side-effect free and expose cursor/ETag, `nextPollAt`,
  rate-limit headers, and `Retry-After` when applicable.
- A `human_action_required` error/reference is a digest-bound request for a
  separately authenticated human decision, never a bearer token. API keys may
  create or observe eligible requests but can never approve them.
- Cookie mutations enforce same-origin/CSRF protections. API-key calls enforce
  key permission plus narrower delegation scope and spend reservations.
- Public DTOs omit content, restricted evidence, internal principal IDs, wallet
  addresses, risk signals, clusters, private errors, and custody metadata.
- Signed proof and payment envelopes have explicit version, audience, expiry,
  nonce/idempotency key, and canonical serialization.

## Test plan

### Pure algorithm tests

- Criteria: zero/missing/duplicate IDs, weights 9,999/10,000/10,001, required
  total below/at 6,000, large base-unit rounding, first/revision/declined-revision/
  blocked outcomes.
- Assignment: every component boundary, missing history, confidence shrinkage,
  correlated endorsements, eligibility, penalties, ties, deterministic replay.
- Quorum: same/different clusters, trust exactly below/at threshold, verified and
  unverified proof, freeform zero weight, author-cluster exclusion, requester
  non-veto, one harmful hold and permanent human block.
- Money: platform fee order, unused reserve, each bond result, one/many/tiny
  contributions, equal remainders, conservation, overflow boundaries.
- Reputation: exact half-life, floor after many years, prior, final-only updates,
  cluster dedupe, confidence bands, post-use signal strengths.
- Ranking: quality/adoption extremes, p95 zero, recency boundary, quarantine,
  deterministic pagination and ties.
- State machines: a table of every legal transition and every illegal transition
  for RFS, assessment, dispute, bond, obligation, and transfer.

### Convex integration tests

- Cookie/API-key identity equivalence, revocation, permissions, wallet proof,
  server-derived roles, author/cluster exclusions, delegation narrowing and
  atomic spend caps, human-action digest/expiry/approval, and cooled two-operator
  recovery.
- Forged public payment/purchase calls, exact receipt binding, replay,
  concurrency, late settlement, cancellation refunds, access grants.
- Criterion immutability, application close, bond timeout, submission/version
  binding, duplicate-request preflight, RFS/application revision supersession,
  withdrawal boundaries, evaluator eligibility/correction, review-assignment
  acceptance, proof verification, scheduled close/reconcile.
- Dispute assignment/resolution, revision supersession, final obligation creation,
  fake-signer retries/receipts, repeatable purchase batches.
- Public/restricted evidence ACL and retention, public DTO redaction, audit logs.
- Reputation event uniqueness, snapshot rebuild equivalence, projection updates,
  public explanation/profile/review projections, principal activity replay,
  cursor pagination without unbounded `.collect()` or N+1 reads.

### Route and end-to-end tests

- Browser cookie and agent API-key flows both create/fund/apply/submit/evaluate.
- Unauthorized, insufficient-permission, stale state, mismatched idempotency, and
  malformed bigint requests return the documented status and DTO.
- Every v2 route request/response validates against generated OpenAPI examples;
  Convex and Zod contract fixtures agree; unversioned routes cannot mutate v2.
- Before sunset, every allowed v1 response carries deprecation/sunset/successor
  metadata and only existing v1 resources can finish. After sunset, every legacy
  marketplace method/path returns its mapped `410 api_version_retired` envelope,
  never calls Convex/payment/storage code, and never redirects a write. Auth
  framework callbacks remain operational and are not classified as legacy API.
- Machine discovery, `SKILL.md`, `/docs`, route permissions, status vocabulary,
  and sunset metadata remain consistent.
- In a fresh session with no hidden Oboe context, an agent using only the final
  skill plus linked machine discovery completes consumer, requester/backer,
  fulfiller, evaluator, human-action, and restart/resume workflows.
- Shared fixture records render equivalent public/principal capability, money,
  status, reputation, and settlement values in the API and human pages.
- An interrupted agent resumes active work and activity from a cursor without
  replaying a write; polling returns no state transition.
- API keys cannot approve human actions, resolve human disputes, grant roles,
  alter clusters, place legal holds, recover accounts, or correct destinations.
- Low-value acceptance, criteria-based partial payout/refund, revision capped at
  90%, verified harmful hold/human block, and high-value human acceptance.
- Public review is visible; restricted raw evidence is denied except to ACL
  members and every allowed/denied read is audited.
- No user-facing action can force close, choose payout, self-declare reviewer
  role, or mark a transfer confirmed.
- Item handoff contains only an Oboe-owned template plus stable ID/URL and never
  interpolates untrusted marketplace text. Sanitization, CSP, attachment headers,
  CSRF/origin checks, and public/private projection boundaries fail closed.
- Public, owner, reviewer, and operator pages pass automated accessibility,
  keyboard-only, recent-passkey, RBAC, and desktop/mobile layout checks.

## Done criteria

All boxes must hold:

- [ ] Every resolved policy above is represented by versioned constants, schema,
      executable tests, and updated authoritative documentation.
- [ ] Policy-v2 RFSs cannot use first-come claim or requester force close.
- [ ] Direct callers cannot forge contributions, purchases, evidence verification,
      reviewer roles, decisions, or settlement receipts.
- [ ] Public Convex queries never return protected skill or evidence content.
- [ ] Payout reduction requires the specified cluster/trust/proof quorum.
- [ ] A qualifying harmful event freezes immediately but permanent block requires
      trusted human resolution.
- [ ] Partial payout and 90% revision cap derive from immutable criteria.
- [ ] Every unreleased base unit maps to a deterministic backer obligation.
- [ ] No obligation is settled until an external receipt is verified.
- [ ] Reputation updates only from final events and exposes score/confidence/count.
- [ ] Post-use reviews never mutate settled RFS payout.
- [ ] Agent and web discovery use the same cursor-paginated 45/45/10 projection.
- [ ] All 110 story IDs in `docs/agent-first-user-stories.md` appear exactly once
      in `plans/001-agent-human-surface-traceability.md`; every `Added` row maps
      to a numbered step, concrete files/routes/pages, and verification.
- [ ] The generated OpenAPI 3.1 document, Zod schemas, Convex validators,
      `public/SKILL.md`, `/docs`, and executable route behavior agree in CI.
- [ ] `public/SKILL.md` was rebuilt after the final v2 route/state contract, not
      copied from the plan; every named endpoint/example validates against
      OpenAPI and the guide-driven fresh-agent E2E suite passes.
- [ ] `/api/v2` is the only policy-v2 mutation surface; compatibility routes
      cannot read protected v2 state or mutate v2 resources outside explicit
      migration adapters.
- [ ] Every published unversioned marketplace route is marked deprecated during
      compatibility and becomes a non-executing `410 api_version_retired`
      tombstone after reconciliation, with a tested exact v2 successor. No old
      endpoint silently serves, proxies, redirects, or mutates product state.
- [ ] Human pages and agent responses use the same projection builders and
      capability engine; intentional asymmetries are tested and documented.
- [ ] API keys and action references cannot execute recent-passkey human actions.
- [ ] Delegated spend ceilings are conserved under concurrent payment intents.
- [ ] Restarted agents can recover active work and cursor-resume activity.
- [ ] Public author/review/RFS/skill links are canonical and stable; handoff text
      never embeds user-authored content.
- [ ] Public, owner, reviewer, and operator flows meet the stated accessibility,
      safe-content, CSP, CSRF, RBAC, and responsive-layout requirements.
- [ ] `npm ci`, `npm test`, `npm run lint`, `npm run typecheck`, and
      `npm run build` exit 0 from a clean checkout.
- [ ] `npm run test:e2e` passes against the documented nonproduction environment.
- [ ] `git diff --check` returns no output.
- [ ] No secrets, raw wallet signing keys, plaintext restricted evidence, raw IPs,
      or direct storage URLs appear in source, logs, fixtures, or snapshots.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop and report; do not improvise, if any condition occurs:

- An in-scope symbol or lifecycle differs materially from Current state after the
  drift check.
- The MPP integration cannot expose or independently verify a receipt bound to
  intent, payer, resource, token, network, and exact amount. Do not replace this
  with trust in a route callback.
- Better Auth local-install migration cannot preserve existing principal IDs or
  current passkey/session behavior.
- API v1/v2 cohort isolation cannot be enforced without allowing an unversioned
  route to mutate policy-v2 state.
- Any published legacy marketplace method/path lacks an unambiguous safe v2
  successor or containing capability, or retiring it would strand an open v1
  resource or unreconciled liability. Do not return a misleading replacement or
  retire that route early.
- Runtime Zod/OpenAPI schemas and Convex validators cannot be kept behaviorally
  equivalent through canonical contract fixtures.
- Delegation spend cannot be reserved and consumed atomically with payment
  intent/receipt state, or a concurrent request can exceed any configured cap.
- A human-action or recovery reference would confer authority by possession, or
  the recent-passkey/digest binding cannot be verified at execution time.
- No recovery design can preserve principal continuity while requiring the
  stated prior factor, cooling period, independent approvals, and key revocation.
- Shared public/principal/reviewer/operator projections cannot prevent protected
  content, wallet, cluster, risk-signal, or custody-data leakage.
- Role-gated reviewer/operator pages cannot enforce active role scope and recent
  passkey authentication at both route and Convex boundaries.
- The final v2 route, capability, error, payment, or lifecycle contract is still
  changing when Step 13 begins, or a fresh agent needs undocumented product
  knowledge to complete a canonical workflow from `public/SKILL.md`.
- A target network cannot verify wallet ownership with the chosen signed
  challenge, or the same wallet can map to multiple active principals.
- Production inventory totals do not reconcile with provider/custody records, or
  any claimed legacy row has no explainable external transfer.
- The work requires converting base-unit money through unsafe JavaScript numbers,
  or token decimals/network identity are not known and immutable.
- A production KMS/custody signer, receipt-verification mechanism, or secure
  evidence wrapping-key provider is unavailable. The code may remain disabled;
  do not ship a raw-key fallback.
- Legal/privacy requirements contradict public-by-default review or the 180-day
  restricted retention policy. Escalate the exact conflict.
- No qualified trusted reviewer pool and on-call owner exists for high-value and
  harmful cases. Keep those cohorts disabled.
- A migration would invent evidence, reviewer identity, wallet ownership,
  criterion outcomes, reputation history, or payment receipts.
- A verification command fails twice after one focused correction, a money
  conservation invariant fails once, or a settlement test indicates a possible
  duplicate transfer.
- Any step appears to require a mainnet transaction, live data mutation,
  destructive cleanup, provider package patch, or out-of-scope feature without
  explicit operator approval.

## Maintenance notes

- Reviewers should scrutinize integer conservation, idempotency, auth derivation,
  evidence ACLs, cluster caps, scheduled retries, and v1/v2 cohort separation
  before UI polish.
- Policy constants are immutable. Any threshold/formula change creates policy
  version 3 plus explicit compatibility tests; never edit v2 in place.
- Risk clustering is advisory and explainable. Periodically audit false merges
  and splits; do not turn a probabilistic signal into an undisclosed ban.
- Reputation and discovery projections must be rebuildable from immutable source
  events. Add a rebuild-equivalence test whenever formulas change.
- A future multi-milestone RFS model should introduce explicit milestone escrow;
  do not stretch the single-revision criterion model into one.
- A future stable Agent Auth integration may issue or exchange credentials for
  the same BetterAuth principal. It must not create a parallel reputation or
  payment identity.
