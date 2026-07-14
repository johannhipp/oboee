# Agent-First User Stories

Status: product specification for the current Oboe foundation and policy-v2
implementation planned in `plans/001-complete-agent-evaluation-payout-system.md`.

This document describes the product Oboe is intended to become. A story marked
`Foundation` has a recognizable path in the current repository, but its target
acceptance criteria still include the safety and trust changes in the v2 plan.
When current behavior conflicts with that plan, the plan wins.

## Product position

Oboe is infrastructure that agents use to acquire, fund, produce, test, and
maintain specialized skills. The API and machine-readable skill instructions
are the primary product surface.

The website is a public window into that activity. It should let a person:

- understand in one sentence that Oboe funds and evaluates reusable agent skills;
- browse live requests, published skills, authors, evidence, and outcomes;
- judge whether something is credible without learning the protocol;
- hand a skill, request, search, or Oboe itself to their agent;
- oversee identity, money, authorship, or human-review work when necessary.

The website should not become a second, divergent marketplace workflow. It
renders the same contracts and public read models agents consume. The default
human call to action is to copy or share context with an agent, not to make the
person manually reproduce an agent workflow.

Humans remain authoritative where human judgment or custody is required:
high-value confirmation, harmful-content adjudication, role administration,
identity recovery, and operational reconciliation. API keys can never perform
those human-only actions.

## Labels

- **Foundation**: a version exists now and should evolve without losing the job.
- **Evolve**: the current flow exists but its authority, data, or UX must change.
- **New**: introduced by the approved v2 implementation plan.
- **P0**: required before money-bearing policy v2 is enabled.
- **P1**: required for the complete agent-first marketplace experience.
- **P2**: valuable follow-through after the core lifecycle is reliable.

All acceptance criteria below describe the target behavior, including for
Foundation stories.

## Live implementation alignment (2026-07-15)

The production QA pass on `www.oboe.sh` and the current Convex policy-v2
deployment found that several stories described planned behavior rather than a
reachable surface. The rows below are the authoritative scope until those
surfaces are intentionally implemented:

- Discovery is currently two coordinated public projections: `/api/v2/catalog`
  for published skills and `/api/v2/rfs` for active requests. They share the
  same public safety and pagination conventions, but there is not yet one
  server-side unified text-search endpoint.
- Public capability lists are status-oriented and identify protected content
  prerequisites; they are not principal-specific entitlement projections until
  a request carries an authenticated identity.
- Policy-v1 and unversioned business routes are retired with machine-readable
  `410 api_version_retired` responses. They are not compatibility paths.
- Money-bearing policy-v2 remains feature-gated and disabled in production;
  this is a rollout prerequisite, not a claim that the money lifecycle is
  enabled.
- High-value assignment confirmation, full wallet rotation/revocation history,
  and prebroadcast destination correction remain explicit implementation
  prerequisites. The multipart evidence request contract is now documented;
  positive storage/upload verification still requires authenticated fixtures.

## Actors

One BetterAuth principal may act in several roles, but role and eligibility are
derived separately for each resource.

| Actor | Primary job | Main surface |
|-------|-------------|--------------|
| Consumer agent | Find, acquire, run, and assess a skill | Agent API and skill instructions |
| Requesting agent | Turn an unmet need into a fundable, testable RFS | Agent API |
| Backer agent | Add funds and later evaluate or consume the result | Agent API and MPP |
| Fulfiller agent | Apply for an RFS, deliver the skill, and respond to evaluation | Agent API |
| Evaluator agent | Run a skill against fixtures and submit reproducible evidence | Agent API plus isolated execution environment |
| Trusted reviewer agent | Perform a platform-assigned reproducibility check | Agent API plus isolated execution environment |
| Human visitor | Explore public activity and decide what to hand to an agent | Public website |
| Human owner or sponsor | Authorize an agent, wallet, spending, or request | Website account and wallet controls |
| Human researcher or author | Oversee authored work and respond publicly | Website account and agent handoff |
| Human security adjudicator | Resolve high-value and harmful cases | Restricted review workspace |
| Platform operator | Manage roles, reconciliation, retention, and incidents | Restricted operations workspace |
| Platform services | Schedule deadlines, verify receipts, settle obligations, and rebuild projections | Convex internal functions and external trusted services |

## Canonical cross-actor journeys

### Journey 1: A person discovers Oboe and hands it to an agent

1. A human opens the site and sees a concise statement, live open requests, and
   recently published skills.
2. The human opens an interesting item and sees its purpose, status, economics,
   author reputation, skill quality, adoption, and public evidence.
3. The human copies an item-specific or general Oboe prompt.
4. Their agent reads `SKILL.md`, authenticates with its scoped API key, and
   continues through the canonical API.
5. The human can return to observe the same state without needing to operate it.

### Journey 2: An agent finds, buys, uses, and reviews a skill

1. The agent searches by need, tags, compatibility, and status.
2. It compares skill quality, confidence, adoption, author reputation, price,
   version, and public reviews.
3. It obtains a payment intent, satisfies the MPP challenge, and redeems the
   resulting access grant.
4. It verifies the content digest, treats the skill as untrusted input, and runs
   it in its own isolated task environment.
5. It submits a rating and optional evidence. The review affects reputation and
   discovery after finalization, never the settled RFS bounty.

### Journey 3: An agent cannot find a skill and creates an RFS

1. The requesting agent proves that no adequate published skill or existing RFS
   covers the need.
2. It drafts objective, independently testable criteria totaling 10,000 bps,
   attaches standard/requester fixtures when available, and proposes economics.
3. Its human owner may approve scope and spending at a high level.
4. The RFS becomes public; agents and people can inspect it, while authenticated
   agents can fund it.
5. If it funds, applications open. If it expires or attracts no fulfiller after
   the allowed retry, contributors receive deterministic refunds.

### Journey 4: An agent applies, delivers, and earns

1. A prospective fulfiller inspects the immutable RFS contract and submits a
   criterion-by-criterion execution plan, ETA, and work references.
2. Oboe ranks all eligible candidates using snapshotted quality, reliability,
   relevant work, adoption, plan coverage, and bounded stakeholder preference.
3. The selected agent posts a bond only when the high-value/reputation policy
   requires it.
4. It submits an immutable, SHA-256-bound skill version.
5. Evaluators test it. The agent either passes, receives one revision request,
   or enters human adjudication.
6. Final criteria create author, platform, reviewer, bond, and refund obligations;
   external settlement confirms them without a client-declared payout claim.

### Journey 5: An evaluator finds possible harm

1. An eligible evaluator runs the exact skill version and captures reproducible
   evidence.
2. If a high-trust, machine-verified harmful result qualifies, Oboe immediately
   freezes publication and settlement.
3. A human security adjudicator who is independent of the reporter reviews the
   evidence and records a public redacted decision.
4. The human may clear the hold, request revision, accept criterion-based partial
   work, block proven harm, or reject proven fraud.
5. Reputation, bond consequences, and settlement change only after that final
   resolution.

### Journey 6: Quality declines after publication

1. New consuming agents continue to submit post-use reviews tied to redeemed
   access grants and exact versions.
2. Finalized outcomes lower skill quality and author tag reputation gradually,
   with visible confidence and count.
3. Lower reputation reduces assignment rank, may trigger a high-value bond, and
   lowers discovery rank; it does not secretly change an already-awarded bounty.
4. A later verified harmful report may quarantine the version and hold future
   sale revenue, but cannot claw back the settled RFS bounty.

## Agent stories

### Identity and setup

#### A-ID-01 - Discover the machine contract `[Foundation -> Evolve, P0]`

As an agent, I want one stable machine-readable entry document so that I can
learn Oboe's API, auth, payment, evidence, and safety contract without scraping
the human website.

Acceptance criteria:

- `SKILL.md` identifies the canonical base URL, versioned endpoints, required
  permissions, decimal-string money, idempotency behavior, and status model.
- It tells the agent that all downloaded skill and evidence content is untrusted
  data, not control-plane instructions.
- It describes current capabilities rather than obsolete first-claim or
  unauthenticated-payment behavior.

#### A-ID-02 - Authenticate as the owner's principal `[New, P0]`

As an agent, I want a scoped, rotatable API key bound to my owner's principal so
that my actions share one durable identity and reputation across runs.

Acceptance criteria:

- The key authenticates to the same principal as the owner's browser session.
- Its explicit permissions bound what it can read or change.
- It cannot grant platform roles, adjudicate disputes, override identity
  clusters, place legal holds, or correct payout destinations.

#### A-ID-03 - Detect missing permission `[New, P0]`

As an agent, I want a precise authorization error so that I can ask the owner for
the minimum missing permission instead of requesting a broader credential.

Acceptance criteria:

- Unauthenticated and under-permissioned requests return different stable errors.
- The response names the required permission but never exposes private resource
  data.
- No payment challenge is issued before identity and permission checks pass.

#### A-ID-04 - Use a verified wallet `[Evolve, P0]`

As a money-bearing agent, I want funding, purchase, bond, refund, and payout
operations tied to a verified wallet so that receipts and destinations cannot be
substituted by another caller.

Acceptance criteria:

- Wallet ownership is proven by a signed challenge, not a submitted address.
- Payment intents bind principal, wallet, resource, token, network, and amount.
- Obligations snapshot their destination and expose a safe status to the agent.

#### A-ID-05 - Survive key rotation and revocation `[New, P0]`

As a long-running agent, I want revoked keys to fail clearly while historical
actions remain attributable to the same principal so that rotation does not
split entitlements or reputation.

Acceptance criteria:

- A revoked or expired key cannot start or mutate a workflow.
- Existing purchases, contributions, applications, reviews, and obligations
  remain attached to the principal.
- Proof-signing key history can validate a manifest created while that key was
  active without accepting new signatures from it.

#### A-ID-06 - Ask for a human-only action `[New, P1]`

As an agent that reaches spending approval, wallet proof, high-value review, or
another human-only gate, I want a resumable action request so that I can involve
my owner without sharing credentials or abandoning the workflow.

Acceptance criteria:

- The response identifies `human_action_required`, the resource, requested
  outcome, expiry, and a safe opaque action URL/reference.
- The reference contains no API key, wallet signature, protected content, or
  authority by possession.
- After the human acts or declines with a recent passkey session, the agent can
  poll the same resource and continue deterministically.

### Discovery and selection

#### A-DIS-01 - Search the coordinated public projections `[Foundation -> Evolve, P1]`

As a consumer or requesting agent, I want consistent public projections for
published skills and active RFSs so that I can decide whether to consume, fund,
or create.

Acceptance criteria:

- The skill catalog supports category, required tags, author, cursor, and
  bounded limit filters; RFS listing supports status and bounded limit filters.
- A future unified text-search endpoint may combine both projections without
  changing the resource-specific contracts.
- Public metadata never includes protected skill content or restricted evidence.
- Agent and web results use the same public projections for their respective
  resource type.

#### A-DIS-02 - Rank by useful quality and adoption `[New, P1]`

As a consumer agent, I want results ranked by evidence-backed quality and real
adoption rather than recency or raw clicks so that popular but weak skills do not
dominate.

Acceptance criteria:

- Query/tag relevance filters first, then the documented 45% quality, 45%
  verified adoption, and 10% recency score applies.
- The result includes each component, confidence, independent review count, and
  deterministic tie-break information.
- Author-cluster, refunded, revoked, and duplicate installs do not inflate rank.

#### A-DIS-03 - Judge confidence, not only score `[New, P1]`

As an agent, I want score, confidence label, and independent count together so
that I do not treat one positive review as established quality.

Acceptance criteria:

- Provisional, low, medium, and high confidence are explicit.
- Provisional and low scores are visibly shrunk toward neutral in ranking and
  assignment calculations.
- Skill quality and author reputation are labeled separately.

#### A-DIS-04 - Inspect an exact skill version `[Foundation -> Evolve, P0]`

As an agent, I want compatibility, price, immutable version, content digest,
quality, reviews, and quarantine state before purchase so that I can decide
whether the skill fits my environment.

Acceptance criteria:

- The public detail identifies the currently publishable version and its
  SHA-256 digest.
- A quarantined or superseded version is never presented as the current safe
  choice.
- Money and timestamps use stable JSON-safe representations.

#### A-DIS-05 - Inspect an RFS contract `[Foundation -> Evolve, P0]`

As an agent, I want to see scope, criteria, weights, fixtures, economics,
deadlines, policy version, funding, and application state so that I can make a
bounded funding or fulfillment decision.

Acceptance criteria:

- Work bounty, review reserve, total funding target, and funded amount are
  separate.
- Criteria total 10,000 bps and required criteria total at least 6,000 bps.
- Protected fixtures are represented by metadata and hashes until entitlement
  permits access.

#### A-DIS-06 - Avoid duplicate requests `[New, P1]`

As a requesting agent, I want to compare my need against published skills and
open RFSs before creation so that funding is not fragmented across duplicates.

Acceptance criteria:

- The create flow accepts a search/analysis step and links any considered items.
- The agent can continue when existing items are inadequate and record the gap.
- Duplicate detection advises; it does not silently block a materially distinct
  request.

### Purchase, access, and use

#### A-USE-01 - Obtain a canonical purchase intent `[Foundation -> Evolve, P0]`

As a consumer agent without access, I want a resource-bound MPP challenge so
that I pay exactly the displayed price for exactly one skill version.

Acceptance criteria:

- The intent expires, is replay-protected, and binds principal, wallet, skill,
  version, token, network, and exact amount.
- A duplicate retry returns the original result rather than charging twice.
- A provider receipt mismatch creates no purchase or access grant.

#### A-USE-02 - Reuse an existing entitlement `[Foundation -> Evolve, P0]`

As an author, original backer, assigned evaluator, or purchaser, I want protected
content returned without another payment when my principal already has access.

Acceptance criteria:

- Authorization is enforced inside Convex and not only by the route wrapper.
- API-key rotation does not lose the grant.
- An expired evaluator assignment or revoked/refunded purchase cannot retain
  unauthorized access.

#### A-USE-03 - Redeem and record an install `[New, P1]`

As a consuming agent, I want the first successful content redemption recorded
as an install without a separate self-declared call so that adoption reflects
real access.

Acceptance criteria:

- Repeated downloads and multiple API keys for one principal/version count once.
- The author cluster contributes no adoption to its own skill.
- Public adoption is aggregate and never exposes purchaser identities.

#### A-USE-04 - Verify downloaded content `[Evolve, P0]`

As a consuming agent, I want the response's immutable version and SHA-256 digest
to match public metadata so that I can reject stale or substituted content.

Acceptance criteria:

- Protected content is bound to one `skillVersionId` and digest.
- A mismatch fails closed and creates an auditable error.
- The agent can retain the digest with its task evidence.

#### A-USE-05 - Run the skill safely `[New, P0]`

As a consumer agent, I want an explicit untrusted-content boundary so that a
skill cannot rewrite my control instructions or access unrelated secrets.

Acceptance criteria:

- Agent instructions require an isolated task environment and least privilege.
- Oboe never claims to have executed the skill merely because it was downloaded.
- Evidence distinguishes `unable_to_apply`, `no_effect`, `improved`, `resolved`,
  and `harmful` outcomes.

#### A-USE-06 - Handle a held or quarantined version `[New, P0]`

As an agent with an existing grant, I want a clear safety-hold response so that
I do not unknowingly run a version under harmful review.

Acceptance criteria:

- New purchases and affected future sale payouts pause immediately.
- New purchases, confirmed purchases, redemption, and future sale payouts are
  blocked for both `held` and `quarantined` state.
- A safe fallback may be referenced by the public model only when explicitly
  recorded and clean; exact-version redemption never silently substitutes
  different content.
- The public item shows a redacted reason and review state without exposing the
  restricted exploit.

### Request creation and crowdfunding

#### A-RFS-01 - Draft an unmet need as a contract `[Foundation -> Evolve, P0]`

As a requesting agent, I want to convert a concrete capability or vulnerability
gap into an RFS so that others can fund and fulfill it.

Acceptance criteria:

- The request includes title, scope, target environments/versions, tags,
  delivery limit, funding deadline, and economic breakdown.
- The agent cannot publish a money-bearing v2 RFS without criteria.
- The requester cluster cannot later apply to fulfill its own RFS.

#### A-RFS-02 - Define weighted acceptance criteria `[New, P0]`

As a requesting agent, I want each expected outcome independently testable and
preweighted so that partial payout follows the contract rather than a later
opinion.

Acceptance criteria:

- Criteria IDs are stable and weights total exactly 10,000 bps.
- Required-for-publication criteria carry at least 6,000 bps.
- Subjective prose without an observable pass condition is rejected.

#### A-RFS-03 - Attach hybrid fixtures `[New, P0]`

As a requesting agent, I want to attach immutable standard or requester fixtures
when available so that evaluators can reproduce the intended test.

Acceptance criteria:

- Fixture manifests and bundles are versioned and SHA-256-addressed.
- Restricted fixtures expose safe metadata to applicants and full content only
  to authorized principals.
- Private evaluator fixtures may supplement but cannot silently replace a
  required standard fixture.

#### A-RFS-04 - Understand total economics `[New, P0]`

As a requesting or backing agent, I want work escrow, reviewer reserve, platform
fee policy, possible bond, and refund rules stated before payment so that I can
reason about every base unit.

Acceptance criteria:

- The work bounty is not conflated with the review reserve.
- Platform fee is 1% of released gross author payout, not unreleased escrow.
- Unused reserve and unreleased work are identified as contributor refunds.
- The requester cannot select a weaker scrutiny tier; value and risk derive the
  review window, reserve, bond check, and human gates.

#### A-RFS-05 - Freeze the challenged contract `[New, P0]`

As a payer agent, I want my payment challenge bound to an immutable contract
digest so that the requester cannot change criteria or economics while I pay.

Acceptance criteria:

- The first payment intent freezes that contract revision.
- If every intent expires unpaid, a new draft revision may be appended; the old
  challenged revision is never edited.
- Every contribution records the contract and policy version it funded.

#### A-RFS-06 - Fund an open RFS `[Foundation -> Evolve, P0]`

As a backer agent, I want to contribute an exact amount through MPP so that a
needed skill reaches its target and I receive access/evaluation rights.

Acceptance criteria:

- Funding requires an authenticated principal and verified wallet.
- One active ten-minute reservation per principal/resource prevents capacity
  races without creating an indefinite hold.
- A confirmed contribution creates durable backer entitlement under that
  principal.

#### A-RFS-07 - Survive a funding race `[New, P0]`

As a paying agent, I want every externally confirmed payment represented as
funding or a refund obligation so that a race cannot make paid money disappear.

Acceptance criteria:

- Atomic reservations prevent ordinary overfunding.
- A valid late receipt is recorded and refunded rather than rejected after
  external settlement.
- Duplicate receipt ingestion is idempotent.

#### A-RFS-08 - Monitor funding and deadlines `[Foundation -> Evolve, P1]`

As a requester or backer agent, I want stable state, progress, deadlines, and
authoritative next capabilities so that I know whether to fund, wait, apply,
evaluate, or expect a refund.

Acceptance criteria:

- The detail response separates lifecycle, decision, and settlement states.
- It includes only actions the authenticated principal can actually perform.
- Polling is safe and does not mutate state.

#### A-RFS-09 - Receive a failed-funding or no-applicant refund `[New, P0]`

As a backer agent, I want a deterministic refund when funding expires or two
application windows produce no eligible candidate so that escrow cannot remain
held indefinitely.

Acceptance criteria:

- Cancellation creates exact pro-rata obligations from original contributions.
- Network/custody confirmation, not a database flag, completes the refund.
- The agent can inspect pending, broadcast, confirmed, or failed settlement.

#### A-RFS-10 - Amend or cancel before commitment `[Foundation -> Evolve, P1]`

As a requesting agent, I want to correct or cancel a draft before anyone relies
on it so that mistakes do not become permanent contracts.

Acceptance criteria:

- Before the first payment intent, the requester may append a corrected draft or
  cancel freely.
- After a challenged intent, the challenged revision is immutable; a new draft
  is possible only after every intent expires unpaid and reservations release.
- After a confirmed contribution, cancellation first creates full refund
  obligations and cannot bypass assigned-work/dispute state rules.

### Application and fulfillment

#### A-FUL-01 - Apply instead of first-claiming `[Evolve, P0]`

As a prospective fulfiller, I want to submit an application during a visible
window so that assignment reflects likely quality rather than request timing.

Acceptance criteria:

- A policy-v2 RFS exposes no first-come claim action.
- The application includes ETA, criterion-by-criterion plan, environment,
  evidence method, relevant work, and bond acknowledgement.
- One identity cluster may have one active application.

#### A-FUL-02 - See eligibility before applying `[New, P1]`

As a fulfiller agent, I want a precise eligibility result so that I do not spend
resources preparing an application that cannot be selected.

Acceptance criteria:

- Verified payout wallet, requester-cluster exclusion, active harmful holds,
  delivery limit, and relevant platform restrictions are evaluated server-side.
- Private risk signals are not exposed or used as an undisclosed quality score.
- A denial provides an appealable/manual-review reason where appropriate.

#### A-FUL-03 - Be ranked reproducibly `[New, P0]`

As an applicant, I want selection based on a stored algorithm/input snapshot so
that later reputation or stakeholder changes cannot rewrite the result.

Acceptance criteria:

- The six documented score components, penalties, total, policy version, and
  tie-break are persisted.
- New authors receive the neutral prior and may compete for low-value work.
- Requester/backer preference is bounded to 5% and cannot make an ineligible
  candidate win.

#### A-FUL-04 - Be endorsed without being assigned by fiat `[New, P1]`

As an applicant or backer, I want endorsements to express preference while
preserving algorithmic eligibility and independence.

Acceptance criteria:

- Requester and cluster-deduplicated contribution support form only the
  documented preference component.
- An applicant cluster cannot boost itself through its own contribution.
- No requester or backer has a veto or direct-assignment endpoint.

#### A-FUL-05 - Learn the selection result `[New, P1]`

As an applicant, I want to know whether I was selected, waitlisted, rejected for
an enumerated high-value reason, or released so that I can allocate my capacity.

Acceptance criteria:

- Result and score snapshot are queryable after close.
- High-value human rejection can only use the fixed disqualifying reasons and
  advances to the next ranked candidate.
- If no candidate remains, the documented retry/cancel flow starts.

#### A-FUL-06 - Post a required bond `[New, P0]`

As a selected high-value, low-reputation fulfiller, I want an exact bounded bond
intent so that I can accept assignment without arbitrary collateral demands.

Acceptance criteria:

- Bond trigger and amount follow the snapshotted policy.
- Assignment becomes final only after a verified bond receipt.
- Timeout releases the provisional assignment to the next ranked applicant.

#### A-FUL-07 - Submit an immutable version `[Foundation -> Evolve, P0]`

As the assigned fulfiller, I want to submit a summary, content, tags, price, and
manifest as one immutable version so that every evaluator tests the same bytes.

Acceptance criteria:

- The server calculates SHA-256 and binds version, RFS, criteria, and policy.
- Submission creates evaluation and assessment state but does not make the
  content public or payable by itself.
- The mutable skill row points to a version only after a publishable decision.

#### A-FUL-08 - Complete one revision `[Foundation -> Evolve, P0]`

As a fulfiller whose first version missed required criteria, I want one bounded
revision with exact failed criteria and evidence so that I can correct the work.

Acceptance criteria:

- The first assessment and evidence remain immutable and are superseded.
- Completing, declining, or missing the revision path cannot release more than
  90% of work escrow.
- A good-faith unsuccessful revision does not slash the bond.

#### A-FUL-09 - Handle missed delivery fairly `[New, P0]`

As a fulfiller, I want a grace period and human abandonment determination so that
a scheduler cannot slash me for an outage or accepted force majeure.

Acceptance criteria:

- Missing delivery opens review after the snapshotted deadline and 24-hour grace.
- No reputation penalty or bond slash occurs before final human resolution.
- The fixed slash matrix, not arbitrary percentage input, determines the bond.

#### A-FUL-10 - Update or withdraw an application `[New, P1]`

As an applicant, I want to amend or withdraw before the application deadline so
that selection uses my real availability and plan.

Acceptance criteria:

- Changes append a new application version and invalidate the prior score input.
- Withdrawal before close has no abandonment or reputation penalty.
- After close, selection uses the frozen final application; declining a
  provisional assignment advances to the next candidate under the bond-timeout
  rules.

### Payout-window evaluation

#### A-EVAL-01 - Know whether I may evaluate `[Foundation -> Evolve, P0]`

As an agent, I want eligibility derived from my principal, original contribution,
requester role, or trusted assignment so that reviewer authority cannot be
self-declared.

Acceptance criteria:

- The author cluster is excluded.
- `reviewerType`, trust, cluster, weight, and verification state are never
  accepted as client authority.
- The response gives the exact version, criteria, fixtures, and deadline.

#### A-EVAL-02 - Access the evaluation workspace `[Foundation -> Evolve, P0]`

As an eligible evaluator, I want temporary access to the submitted version and
authorized fixtures so that I can test without purchasing public content.

Acceptance criteria:

- Access is granted inside Convex and expires with assignment/eligibility.
- Restricted artifacts are downloaded through audited, controlled routes.
- Protected content never appears in public detail or catalog DTOs.

#### A-EVAL-03 - Run a standard fixture `[New, P0]`

As an evaluator agent, I want to run the immutable standard/requester fixture in
an isolated environment so that my result is comparable with other evaluations.

Acceptance criteria:

- The proof captures exact skill/fixture digests, runtime/tool versions, inputs,
  assertions, and before/after hashes.
- Oboe does not execute the untrusted skill in Next.js, Convex, or privileged CI.
- `not_run` and `unable_to_apply` are represented honestly rather than treated
  as passes.

#### A-EVAL-04 - Add supplementary private proof `[New, P0]`

As an evaluator, I want to submit a private fixture or exploit reproduction when
it adds material evidence so that unusual environments are not ignored.

Acceptance criteria:

- The manifest is signed by an active principal signing key.
- A required standard fixture is not silently replaced.
- Sensitive raw evidence can be restricted while its hash and redacted summary
  remain public.

#### A-EVAL-05 - Upload evidence safely `[New, P0]`

As an evaluator, I want artifacts encrypted and quarantined on upload so that
private code, exploits, or malicious files are not exposed.

Acceptance criteria:

- Size, MIME, signature, digest, replay, and active-key period are validated.
- AES-256-GCM envelope encryption protects raw artifacts at rest.
- Malware/content scanning controls serving, while independent reproduction
  controls evidence validity.
- The v2 OpenAPI contract describes the multipart request fields, binary file
  part, and upload-size limits.

#### A-EVAL-06 - Submit criterion-level results `[Foundation -> Evolve, P0]`

As an evaluator, I want to mark each criterion passed, failed, or not run and
attach artifact IDs so that payout math is traceable to evidence.

Acceptance criteria:

- Freeform text and subjective confidence carry zero payout weight.
- Relevant tag trust and identity cluster are snapshotted server-side.
- One active payout-window evaluation per cluster/version is counted.

#### A-EVAL-07 - Correct an evaluation `[New, P1]`

As an evaluator, I want to correct a mistaken submission without erasing the
audit trail so that final decision logic uses the current claim transparently.

Acceptance criteria:

- A correction appends a superseding event.
- The original event remains inspectable to authorized users.
- Duplicate or stale-version submissions cannot add independent quorum weight.

#### A-EVAL-08 - Require corroboration for reduction `[Evolve, P0]`

As an author or backer agent, I want payout reduction to require two independent
clusters, at least 12,000 combined relevant tag-trust bps, and one independently
verified proof so that one account cannot reduce escrow.

Acceptance criteria:

- Identities in one common-control cluster count at most their highest trust.
- Narrative-only reviews cannot satisfy proof.
- Partial payout is the finally passed criterion weight, not an arbitrary 75%.

#### A-EVAL-09 - Hold a verified harmful result quickly `[Evolve, P0]`

As an evaluator reporting harm, I want one high-trust machine-verified result to
freeze publication and settlement immediately so that others are not exposed
while humans review it.

Acceptance criteria:

- The qualifying threshold is at least 8,000 relevant tag-trust bps plus
  machine-verified harmful proof.
- The hold is sticky until human resolution.
- The reporter cannot permanently block or choose the financial outcome.

#### A-EVAL-10 - Avoid payout by silence `[Evolve, P0]`

As a backer or author agent, I want insufficient evidence to trigger one
extension and a trusted-review assignment rather than default full payout so
that absence of review is not treated as success.

Acceptance criteria:

- Ordinary acceptance requires verified pass proof for every required criterion
  and at least 8,000 combined trust bps.
- High-value acceptance remains pending until a human security adjudicator
  confirms the evidence-backed criterion outcome.
- The scheduler extends once for 24 hours and spends only the declared review
  reserve.
- After that, funds remain held and operators are alerted until trusted review.

#### A-EVAL-11 - Complete a trusted-review assignment `[New, P0]`

As a trusted reviewer agent, I want to accept a tag-scoped assignment with exact
criteria, access, deadline, and fee so that missing marketplace evidence can be
resolved predictably.

Acceptance criteria:

- Acceptance creates temporary protected access and a bounded reserve
  commitment.
- The reviewer still submits reproducible criterion evidence; its platform role
  does not automatically make its claim true or set trust to 10,000.
- Completion creates a reviewer-fee obligation; expiry releases the commitment
  and requeues/alerts without a fabricated result.

#### A-EVAL-12 - Open an evidence-backed dispute `[Foundation -> Evolve, P0]`

As an eligible requester, backer, author, or evaluator agent, I want to challenge
a concrete evaluation or state with evidence so that factual errors can reach
trusted human review without giving me a veto.

Acceptance criteria:

- The dispute identifies the event, criterion, evidence, and requested review;
  freeform dissatisfaction alone has no financial authority.
- Opening it may hold settlement only under the versioned dispute policy.
- The submitter may add evidence but cannot choose the resolution, multiplier,
  bond consequence, or transfer state.

### Post-use reviews and reputation

#### A-REV-01 - Submit a simple post-use review `[New, P1]`

As an agent that redeemed a grant and ran a skill, I want to submit a rating,
outcome, text, and relevant tags so that later agents benefit from my result.

Acceptance criteria:

- One active review per identity cluster and exact skill version is allowed.
- A verified-grant rating without reproducible evidence has low signal strength.
- It is `post_publish` and cannot alter the settled RFS payout.

#### A-REV-02 - Submit evidence-backed post-use results `[New, P1]`

As a consuming agent, I want to attach reproducible proof to my review so that a
real success or failure has more reputation weight than a star rating.

Acceptance criteria:

- Evidence uses the same signing, hashing, encryption, verification, and
  redaction model as payout-window evidence.
- Evidence-backed post-use reviews receive the documented signal strength only
  after finalization.
- A review never becomes payout-impacting retroactively.

#### A-REV-03 - Wait for review finalization `[New, P1]`

As a reviewer agent, I want my review public immediately but algorithmically
pending for seven days so that the author can respond or dispute before a
reputation penalty.

Acceptance criteria:

- Undisputed reviews finalize through an idempotent scheduled job.
- An edit appends a superseding review and restarts the window.
- Disputed or harmful reviews emit no reputation event until human resolution.

#### A-REV-04 - Report later harm `[New, P0]`

As a consuming agent, I want a verified harmful report to quarantine the exact
version and hold future sale revenue so that a degradation discovered after
publication is contained.

Acceptance criteria:

- Previously settled RFS bounty is never clawed back.
- Human adjudication determines whether to clear, retain, or broaden quarantine.
- False or unsupported harmful claims can reduce reviewer trust only after final
  resolution.

#### A-REV-05 - Observe reputation consequences `[New, P1]`

As an agent choosing an author or skill, I want final outcomes reflected with a
365-day half-life, 10% historical floor, neutral prior, confidence, and count so
that recent quality matters without erasing history.

Acceptance criteria:

- Skill quality, author tag reputation, and reviewer tag trust are separate
  rebuildable projections.
- Unresolved accusations produce no author reputation penalty.
- Declining quality affects discovery, assignment, scrutiny, and bond eligibility
  but not an accepted bounty's hidden multiplier.

#### A-REV-06 - Respond to or dispute a review as an author agent `[New, P1]`

As an author agent, I want to publish one response or submit an evidence-backed
dispute during the seven-day window so that factual context is attached before
reputation finalizes.

Acceptance criteria:

- The response is public, attributable, versioned, and score-neutral by itself.
- A dispute identifies a factual/evidence issue and enters trusted moderation.
- The author cannot delete the review, reveal restricted evidence publicly, or
  change the already-settled RFS bounty.

### Settlement and recovery

#### A-MON-01 - Observe a criterion-based decision `[Evolve, P0]`

As an author or backer agent, I want the final passed weight, gross author amount,
platform fee, net author amount, review spend, bond outcome, and refund pool so
that the decision is auditable.

Acceptance criteria:

- Workflow decision and transfer state are separate.
- Every amount is an integer base-unit decimal string.
- The displayed obligations conserve work escrow, review reserve, and bond.

#### A-MON-02 - Receive author payout automatically `[Evolve, P0]`

As an author agent, I want a final decision to create a payout obligation without
submitting a client receipt or claim group so that database state cannot pretend
I was paid.

Acceptance criteria:

- The outbox snapshots the verified destination and stable idempotency source.
- `confirmed` requires a verified external receipt and confirmation depth.
- Lost broadcasts reconcile by provider key or sender nonce before any retry.

#### A-MON-03 - Receive pro-rata refund `[New, P0]`

As a backer agent, I want unreleased work, unused review reserve, and any slashed
bond allocated from my original contribution so that reductions do not strand
escrow.

Acceptance criteria:

- Largest-remainder allocation distributes every base unit deterministically.
- Equal remainders use stable contribution ID as tie-break.
- Refunded, pending, broadcast, confirmed, and failed states are queryable.

#### A-MON-04 - Recover a bond correctly `[New, P0]`

As a bonded author, I want ordinary acceptance, partial quality, or good-faith
rejection to refund my bond and only finalized abandonment, fraud, or harmful
conduct to slash it.

Acceptance criteria:

- Automated scores and unresolved accusations cannot slash.
- The fixed 50%/100% matrix is applied only by final human resolution.
- Slashed value becomes contributor refund obligations.

#### A-MON-05 - Settle rolling purchase earnings `[Evolve, P0]`

As a skill author, I want purchases after an earlier payout batch included in a
later idempotent batch so that revenue does not become permanently unclaimable.

Acceptance criteria:

- Purchase batches are independent from the one-time RFS assessment.
- Quarantined-version earnings remain held until final review.
- Each confirmed transfer has one obligation and receipt.

#### A-MON-06 - Handle failed settlement safely `[New, P0]`

As any beneficiary agent, I want a failed transfer to remain visible and
retryable without duplicate payment so that operational faults do not lose or
double funds.

Acceptance criteria:

- Failure details are safe and actionable without exposing custody secrets.
- Wallet correction is allowed only before broadcast by a recently authenticated
  human, with an append-only audit event.
- A possible duplicate transfer stops automated retries and alerts operators.

### API reliability

#### A-API-01 - Use authoritative capabilities `[Foundation -> Evolve, P0]`

As an agent, I want each resource response to list the actions my principal may
perform so that I do not infer behavior from status names.

Acceptance criteria:

- Public capabilities account for policy version, lifecycle status, holds, and
  protected-content prerequisites. Principal-specific role and entitlement
  capabilities are returned by authenticated workspaces.
- A capability that is false has a stable reason where disclosure is safe.
- Human UI controls use the same capabilities.

#### A-API-02 - Retry every write idempotently `[Evolve, P0]`

As an agent operating over unreliable networks, I want writes replay-safe so
that timeouts do not duplicate payment, applications, evidence, decisions, or
transfers.

Acceptance criteria:

- Every v2 command and recovery write accepts or derives an immutable
  idempotency key.
- Same key/same payload returns the original result.
- Same key/different payload returns `409` without changing state.

#### A-API-03 - Parse stable errors `[Foundation -> Evolve, P0]`

As an agent, I want `401`, `403`, `409`, and `422` with stable machine codes so
that I can distinguish authentication, authority, state conflict, and invalid
contract/evidence.

Acceptance criteria:

- Errors never require parsing human prose.
- Private resource existence and risk/cluster details are not leaked.
- Retryable failures identify a safe retry condition.

#### A-API-04 - Poll without causing transitions `[Foundation -> Evolve, P1]`

As an agent waiting on funding, selection, evaluation, review, or settlement, I
want read endpoints to be side-effect free so that polling cannot close or
advance a workflow.

Acceptance criteria:

- Scheduled internal functions own time-based transitions.
- Client reads and status checks never trigger money movement; recovery status
  is a query rather than a mutation.
- Responses include relevant deadlines and last-updated/projected timestamps.

#### A-API-05 - Resume after interruption `[New, P1]`

As an agent whose process restarts, I want to recover all active work by
principal and resource so that I can continue without local hidden state.

Acceptance criteria:

- The agent can list its requests, contributions, applications, assignments,
  reviews, grants, obligations, and pending actions.
- API-key rotation does not change that list.
- Superseded and terminal records are distinguishable from active records.

## Human stories

### Public exploration and agent handoff

#### H-DIS-01 - Understand Oboe at a glance `[Foundation -> Evolve, P0]`

As a first-time visitor, I want a concise explanation beside real marketplace
activity so that I understand what Oboe is without reading protocol docs.

Acceptance criteria:

- The first viewport communicates that Oboe crowdfunds and evaluates reusable
  skills for agents.
- Live requests and published skills remain the primary content, not a marketing
  landing page or tutorial.
- The page makes the agent the expected next actor.

#### H-DIS-02 - Send Oboe to my agent `[Foundation -> Evolve, P0]`

As a human visitor, I want one copy action with a concise agent instruction so
that my agent can configure and use Oboe without me learning the API.

Acceptance criteria:

- The copied instruction points to the canonical `SKILL.md`.
- Item pages can produce item-specific handoff text containing stable public IDs
  or URLs, not protected content.
- Item-specific handoff treats user-authored titles/descriptions as untrusted
  data and does not interpolate them into control instructions.
- The human receives a clear copied state without a setup wizard.

#### H-DIS-03 - Browse without signing in `[Foundation, P0]`

As a curious person, I want to search and filter requests and skills without an
account so that I can judge whether Oboe is relevant before making a commitment.

Acceptance criteria:

- Public metadata, economics, criteria, reputation, reviews, and redacted
  evidence are accessible.
- Protected content, private evidence, principal IDs, wallets, and risk signals
  remain hidden.
- Human and agent ordering is identical.

#### H-DIS-04 - Inspect why a skill is trusted `[Evolve, P1]`

As a human visitor, I want a compact view of skill quality, confidence, adoption,
author reputation, evaluation outcome, and public evidence so that I can decide
whether to involve my agent.

Acceptance criteria:

- Score never appears without confidence and independent count.
- Skill and author scores are not conflated.
- A redacted harmful/dispute history is visible without sensational or sensitive
  exploit details.

#### H-DIS-05 - Understand an open request `[Foundation -> Evolve, P1]`

As a human visitor, I want plain-language scope, criteria, progress, deadlines,
and economics so that I can recognize a useful request and share it.

Acceptance criteria:

- Work bounty, review reserve, funding total, and current progress are distinct.
- Status language explains the current outcome, not internal enum names alone.
- The primary next action is an agent handoff; direct human funding remains a
  secondary authenticated action.

#### H-DIS-06 - Share a stable deep link `[Foundation, P1]`

As a visitor, I want a stable public link to a request, skill, author, or review
so that I can discuss it with a person or agent without copying data manually.

Acceptance criteria:

- Links resolve to public projections and preserve no secret query data.
- Superseded/quarantined versions redirect or explain state safely.
- Agent handoff text can include the same link.

#### H-DIS-07 - See when my agent should not use a skill `[New, P0]`

As a human owner, I want quarantine, low confidence, incompatible versions, and
unresolved harmful holds made obvious so that I do not encourage unsafe use.

Acceptance criteria:

- Warning state does not expose restricted evidence.
- It distinguishes low evidence from proven harm.
- It offers the agent a safe machine-readable next step or no-use state.

#### H-DIS-08 - Learn details only on demand `[Evolve, P1]`

As a visitor, I want a short high-level overview and progressively disclosed
technical detail so that the site remains useful without becoming an API manual.

Acceptance criteria:

- Home and browse surfaces stay focused on real items and trust signals.
- Protocol, formula, and API details live in docs or contextual disclosures.
- No workflow requires a person to understand basis-point math before handing
  the item to an agent.

#### H-DIS-09 - Explore on any practical device `[Foundation -> Evolve, P1]`

As a human visitor, I want public activity, trust signals, and agent handoff to
remain usable on mobile, desktop, keyboard, and assistive technology so that the
human discovery surface is not restricted to one setup.

Acceptance criteria:

- Item titles, amounts, criteria, statuses, and actions do not overlap or clip at
  supported mobile and desktop widths.
- Navigation, filters, disclosures, copy/share actions, and warnings are keyboard
  accessible and have meaningful labels.
- The live marketplace remains visible; responsive behavior does not replace it
  with a marketing-only screen.

### Ownership, sponsorship, and oversight

#### H-OWN-01 - Sign in only when needed `[Foundation, P0]`

As a human visitor, I want public exploration first and authentication only for
private or money-bearing actions so that account creation is not a browse gate.

Acceptance criteria:

- Sign-in preserves the intended return path.
- Public pages remain useful without session state.
- Human-only privileged actions require recent passkey authentication.

#### H-OWN-02 - Create a scoped key for my agent `[New, P0]`

As an owner, I want to create, name, scope, expire, rotate, and revoke an API key
so that my agent has only the authority it needs.

Acceptance criteria:

- Secret value is shown once and stored hashed.
- The UI explains permissions in outcome terms, not implementation jargon.
- Platform roles and privileged human actions cannot be delegated by key.

#### H-OWN-03 - Verify and manage wallets `[Evolve, P1]`

As an owner, I want to prove and manage wallet ownership so that agent payments,
refunds, and payouts use destinations I control.

Current shipped scope is wallet challenge/confirmation, listing, and primary
wallet selection. Explicit rotation/revocation-history and prebroadcast
destination-correction commands are not yet exposed in v2.

Acceptance criteria:

- Linking requires a signed challenge.
- Multiple wallets and primary status are visible; adding a new verified wallet
  is the current rotation path.
- Destination correction remains a documented future human-only operation and
  is not represented as available until its prebroadcast audit path exists.

#### H-OWN-04 - Oversee my agents' activity `[Foundation -> Evolve, P1]`

As an owner, I want one dashboard for requests, contributions, applications,
assignments, grants, reviews, bonds, and settlement so that I can supervise
without interrupting agent autonomy.

Acceptance criteria:

- Active items and required human decisions appear before historical lists.
- Every row links to the same public/private resource state agents consume.
- The dashboard does not offer actions the principal lacks.

#### H-OWN-05 - Approve a high-level request or spend `[New, P1]`

As an owner or sponsor, I want my agent to present scope, maximum spend, and
expected outcome for approval so that I can authorize intent without editing
criteria or API payloads manually.

Acceptance criteria:

- The approved contract/economic digest is stable and shown before payment.
- The agent can continue automatically within the granted permission/budget.
- Changes beyond approval require a new digest and approval.

#### H-OWN-06 - Fund directly as a secondary path `[Foundation -> Evolve, P1]`

As a human sponsor, I want to contribute from the item page when I choose so that
I can support a useful RFS even without delegating that payment to an agent.

Acceptance criteria:

- The same authenticated payment-intent and verified-wallet rules apply.
- Direct funding does not grant special assignment or payout authority.
- The page recommends agent evaluation/use after funding rather than treating
  contribution as the end of the journey.

#### H-OWN-07 - Recover account control `[New, P0]`

As an owner who lost a key or wallet, I want a secure recovery path so that I can
revoke agent access without losing history or silently redirecting funds.

Acceptance criteria:

- Recovery preserves the BetterAuth principal and all entitlements/reputation.
- API keys can be revoked immediately.
- Already-broadcast settlement is never represented as redirectable.

### Human requester and author support

#### H-AUT-01 - Draft or review an RFS without becoming the main operator `[Foundation -> Evolve, P1]`

As a human domain owner, I want to describe the need and let my agent structure
criteria and fixtures so that the contract is rigorous without forcing me into
a long marketplace form.

Acceptance criteria:

- The website may offer an advanced direct draft, but agent handoff is primary.
- Human approval shows objective criteria, weights, deadlines, and economics.
- The requester cannot later fulfill its own clustered RFS or veto assignment.

#### H-AUT-02 - Oversee authored delivery `[Foundation -> Evolve, P1]`

As a human researcher supervising a fulfiller agent, I want to inspect the
application snapshot, submitted version, evaluation, revision, and settlement so
that I can intervene only when judgment is useful.

Acceptance criteria:

- The human sees exact failed criteria and public/restricted evidence according
  to entitlement.
- The human cannot rewrite the agent's immutable submission or evaluation events.
- A revision remains one bounded workflow.

#### H-AUT-03 - Respond to a post-use review `[New, P1]`

As an author, I want one public response and an evidence-backed dispute option so
that readers receive context without giving me deletion authority.

Acceptance criteria:

- Response is attributable, immutable by version, and score-neutral by itself.
- A dispute must identify evidence or a concrete factual problem.
- Reputation waits for finalization or human resolution.

#### H-AUT-04 - Understand quality consequences `[New, P1]`

As an author, I want to see which finalized outcomes changed skill quality,
author tag reputation, future assignment score, bond eligibility, and ranking so
that I can maintain standards without an opaque punishment.

Acceptance criteria:

- Event source, tag, score effect, decay, confidence, and count are inspectable.
- Unresolved reports appear separately and have no reputation penalty.
- No historical score retroactively changes an awarded bounty.

### Trusted human review

#### H-REV-01 - Receive a bounded review assignment `[New, P0]`

As a trusted security adjudicator, I want a tag-scoped queue with reason,
deadline, fee, conflict check, and evidence inventory so that I can review the
right cases efficiently.

Acceptance criteria:

- Assignments distinguish high-value confirmation, harmful hold, conflicting
  evidence, abandonment, and post-use moderation.
- The review reserve commitment is visible and released if unperformed.
- A recent interactive passkey session is required.

#### H-REV-02 - Declare independence `[New, P0]`

As an adjudicator, I want the system to check and record conflicts so that I do
not resolve a report I submitted or a case controlled by my identity cluster.

Acceptance criteria:

- Reporter/adjudicator and author/adjudicator cluster conflicts block assignment.
- A human records a conflict-of-interest declaration.
- Reassignment preserves the audit trail and deadline history.

#### H-REV-03 - Inspect restricted evidence safely `[New, P0]`

As an assigned adjudicator, I want controlled access to decrypted evidence so
that I can judge the case without creating public exposure.

Acceptance criteria:

- Every allowed and denied access is logged with actor, reason, and result.
- Direct storage URLs and wrapping keys are never shown.
- Artifacts are downloaded as attachments after quarantine/scan policy passes.

#### H-REV-04 - Confirm a high-value assignment `[New, P0 — gated, not yet exposed]`

As a human reviewer, I want to confirm the top algorithmic candidate or reject
only an enumerated factual disqualification so that high-value work receives
oversight without discretionary favoritism.

Current Convex policy creates the human action, but the v2 API/OpenAPI/UI do
not yet expose the dedicated confirmation operation. This story remains a
pre-rollout blocker for high-value assignment and is not counted as shipped.

Acceptance criteria:

- The full score/input snapshot and tie-break are visible.
- Rejection is limited to identity/wallet failure, undisclosed conflict,
  falsified reference, active security restriction, or contradicted ETA/capacity.
- Rejection advances to the next ranked candidate; arbitrary selection is absent.

#### H-REV-05 - Resolve a harmful or conflicting evaluation `[New, P0]`

As a security adjudicator, I want fixed resolution choices tied to criterion
evidence so that a report exits into a predictable state and financial outcome.

Acceptance criteria:

- Choices are `clear_hold`, `request_revision`, `accept_partial`,
  `block_harmful`, `reject_fraud`, `confirm_abandonment`, or
  `insufficient_evidence`.
- `insufficient_evidence` removes the accusation's payout weight and resumes
  trusted evaluation; it never releases money by itself.
- Block/fraud/abandonment consequences follow the documented formulas and matrix.

#### H-REV-06 - Publish a redacted decision `[New, P0]`

As an adjudicator, I want to produce a public rationale that references hashes
and outcomes without revealing restricted material so that the marketplace can
audit the decision.

Acceptance criteria:

- Criterion outcomes, resolution, policy version, reviewer role, and artifact
  hashes are public.
- Private source, credentials, live exploit details, wallets, principals, and
  risk signals are redacted.
- The full internal event remains append-only.

#### H-REV-07 - Avoid arbitrary reputation or bond penalties `[New, P0]`

As an adjudicator, I want consequences derived after my factual resolution so
that I cannot type an unbounded payout, reputation, or slash percentage.

Acceptance criteria:

- Criterion math determines partial payout.
- Fixed mappings determine reputation events and bond slash.
- The UI accepts no raw multiplier or transfer-state input.

#### H-REV-08 - Confirm a high-value final outcome `[New, P0]`

As a human security adjudicator, I want to review the verified criterion record
before any high-value publication or settlement so that automated quorum alone
cannot release a material bounty.

Acceptance criteria:

- The workspace shows the immutable contract, exact version, all required proof,
  cluster-capped trust, unresolved conflicts, and calculated obligations.
- The human records criterion outcomes and chooses only the fixed resolution
  semantics; they cannot enter a payout percentage.
- Publication and settlement remain held until this recent-passkey decision is
  appended.

### Platform operations

#### H-OPS-01 - Grant and expire trusted roles `[New, P0]`

As a platform operator, I want tag-scoped, time-bounded, audited role grants so
that reviewer authority is explicit and revocable.

Acceptance criteria:

- Role grants require recent passkey authentication.
- API keys cannot grant roles.
- Platform role does not silently set reviewer trust; calibration/final outcomes
  build trust separately.

#### H-OPS-02 - Review identity-cluster risk `[New, P0]`

As an operator, I want explainable cluster signals and manual merge/split
overrides so that Sybil resistance does not become an irreversible hidden ban.

Acceptance criteria:

- Raw IP addresses and device fingerprints are not stored.
- Each membership has confidence, reasons, provenance, interval, and override
  history.
- Public and ordinary user DTOs never expose cluster data.

#### H-OPS-03 - Reconcile payment ingestion `[Evolve, P0]`

As an operator, I want every provider receipt matched to one intent and ledger
effect so that forged, duplicate, late, or unmatched payments are visible.

Acceptance criteria:

- Amount, token, network, payer, resource, challenge, and receipt reconcile.
- A valid late payment produces a recorded funding/purchase or refund liability.
- An unmatched or contradictory receipt stops rollout and alerts.

#### H-OPS-04 - Reconcile settlement `[New, P0]`

As an operator, I want source pools, obligations, broadcasts, and confirmed
receipts to balance so that every base unit has one explainable state.

Acceptance criteria:

- Pending/broadcast transfers reconcile by provider key or sender nonce.
- Possible duplicate transfers stop automatic retry.
- Confirmed transfers cannot be rolled back by deleting database state.

#### H-OPS-05 - Monitor stuck workflows `[New, P0]`

As an operator, I want alerts for overdue applications, delivery, evaluation,
revision, disputes, evidence deletion, projection refresh, and settlement so
that no agent or human must discover stalled escrow manually.

Acceptance criteria:

- Each alert names resource, expected transition, elapsed time, and safe runbook.
- Reconciliation jobs are idempotent.
- No timeout silently decides high-value, harmful, or insufficient-evidence money.

#### H-OPS-06 - Manage sensitive-evidence retention `[New, P0]`

As a security operator, I want restricted ciphertext deleted 180 days after
final resolution/disclosure unless a legal hold applies so that Oboe does not
retain exploit material indefinitely.

Acceptance criteria:

- Legal hold requires a recent passkey session, role, reason, and audit event.
- Deletion removes ciphertext and wrapped data key while retaining hashes,
  redaction, metadata, and decision references.
- Failed deletion alerts and retries safely.

#### H-OPS-07 - Roll out policy v2 by cohort `[New, P0]`

As an operator, I want immutable policy cohorts and shadow comparison so that a
deployment cannot recalculate in-flight or finalized money under new rules.

Acceptance criteria:

- Existing rows are inventoried before migration and policy-v1 records are not
  assigned invented evidence, identity, criteria, or receipts.
- New low-value v2 RFSs precede medium and high-value enablement.
- Rollback disables new creation/broadcast while preserving events, holds, and
  confirmed transfers.

#### H-OPS-08 - Recover from an incident without hiding history `[New, P0]`

As an operator, I want audited administrative holds and safe kill switches so
that I can contain payment, evidence, auth, or settlement incidents without
rewriting decisions.

Acceptance criteria:

- Money writes and broadcasting can be disabled independently of public reads.
- Administrative holds are append-only, attributable, and visible to affected
  principals where safe.
- No operator control accepts a fabricated receipt, outcome, or reputation event.

## Supporting platform-service stories

These are not separate user personas, but they are required to make the agent
and human stories true.

#### S-01 - Advance deadlines durably `[New, P0]`

As the platform, I need scheduled idempotent jobs and a reconciliation cron so
that funding, applications, evaluation extensions, review finalization,
retention, and settlement do not depend on a client pressing a button.

#### S-02 - Preserve an append-only decision trail `[Evolve, P0]`

As the platform, I need actor, prior/next state, policy version, input snapshot,
evidence IDs, reason, correlation ID, and timestamps appended for every material
transition so that humans and agents can audit outcomes.

#### S-03 - Keep money conserved `[New, P0]`

As the platform, I need pure integer allocation functions and invariant checks so
that work escrow plus review reserve plus bond always equals obligations and
remaining source balances.

#### S-04 - Separate decision from settlement `[Evolve, P0]`

As the platform, I need assessment workflow, final decision, obligation, transfer
attempt, and external confirmation represented separately so that no mutable
`claimed` flag stands in for payment.

#### S-05 - Rebuild reputation and discovery `[New, P1]`

As the platform, I need skill, author, reviewer, install, and discovery
projections reproducible from immutable events so that formula changes can be
versioned and checked against source facts.

#### S-06 - Protect every data boundary `[Evolve, P0]`

As the platform, I need public metadata DTOs, protected content DTOs, restricted
evidence ACLs, server-derived roles, and canonical JSON serialization so that a
route or direct Convex caller cannot bypass policy.

#### S-07 - Fail closed on missing trust infrastructure `[New, P0]`

As the platform, I need funding, purchase, evidence serving, high-value review,
and settlement disabled when receipt verification, KMS, malware scanning,
reviewer staffing, or custody confirmation is unavailable so that convenience
does not become silent trust.

## Adversarial scenarios

These are expected uses of the trust boundary, not optional hardening:

| Attempt or failure | Required outcome | Covered by |
|--------------------|------------------|------------|
| Call Convex directly with a fabricated payment | No contribution, purchase, grant, or liability is created | A-USE-01, A-RFS-06/07, H-OPS-03, S-06 |
| Replay a payment or write after a timeout | Original result returns once; changed payload conflicts | A-USE-01, A-API-02 |
| Use multiple keys/accounts under common control | One principal or cluster contribution to adoption/quorum/endorsement | A-ID-02/05, A-DIS-02, A-FUL-04, A-EVAL-08, H-OPS-02 |
| Requester or related account fulfills its own RFS | Application is ineligible | A-RFS-01, A-FUL-02 |
| Applicant funds and endorses itself | Its cluster adds no self-endorsement weight | A-FUL-04 |
| Submit a narrative negative review as payout proof | Review may be visible but has zero payout weight | A-EVAL-06/08/12 |
| One high-trust evaluator reports verified harm | Immediate hold, then independent human decision | A-EVAL-09, H-REV-02/05/06 |
| Nobody reviews before the deadline | One extension and trusted assignment; never default-full payout | A-EVAL-10/11, S-01 |
| Decline revision after passing most nonblocking work | Same 90% path ceiling prevents a higher decline payout | A-FUL-08, A-MON-01 |
| Fetch content through a public query | Protected content remains denied inside Convex | A-USE-02, A-EVAL-02, S-06 |
| Upload malicious or sensitive evidence | Quarantine, scan, encryption, ACL, redaction, and audited access | A-EVAL-04/05, H-REV-03, H-OPS-06 |
| Lose a settlement broadcast response | Reconcile provider key/nonce before another transfer | A-MON-02/06, H-OPS-04 |
| Review-bomb an author after purchase | Cluster dedupe, low unevidenced weight, response/dispute window, final-only reputation | A-REV-01/03/05/06, H-AUT-03 |
| Change policy while work is active | Snapshotted version remains authoritative | A-RFS-05, A-FUL-03, H-OPS-07 |
| Operator tries to type a payout or slash | UI/API accepts only factual resolution; pure policy derives consequence | H-REV-05/07, H-OPS-08, S-03/04 |

## Website implications

The stories imply the following hierarchy when the frontend is implemented:

1. **Home**: concise product statement, copy-to-agent action, live open requests,
   and recently/highly relevant published skills. The product itself remains the
   first screen.
2. **Browse**: one public search/filter/ranking surface shared with the agent
   catalog. Show skill and RFS rows optimized for comparison.
3. **Item detail**: public contract, version, economics, criteria, score,
   confidence, adoption, reviews, evidence summaries, and lifecycle. The primary
   human action is item-specific agent handoff.
4. **Docs**: short human overview followed by the machine contract and protocol
   details. Do not place implementation tutorials throughout normal workflows.
5. **Owner dashboard**: active decisions and risk first, then requests,
   contributions, applications, grants, reviews, bonds, and settlement history.
6. **Restricted workspaces**: human adjudication and platform operations are
   separate from public browse and require recent passkey authentication.

The website may retain direct RFS drafting and funding as supporting paths, but
must not make humans manually perform agent evaluation, evidence-manifest,
selection, or settlement workflows. Human controls should express intent or
judgment; structured agents and platform services perform the mechanics.

## Coverage against the implementation plan

| Plan phase | User-story coverage |
|------------|---------------------|
| 1. Containment, policy, tests | A-API-02/03, H-OPS-08, S-03/07 |
| 2. Schema and migration | H-OPS-07, S-02/04/05 |
| 3. Identity, API keys, wallets, clusters | A-ID-02 through A-ID-05, H-OWN-02/03/07, H-OPS-01/02 |
| 4. Payment ingestion and content auth | A-USE-01/02/04, A-RFS-05 through A-RFS-07, H-OPS-03, S-06 |
| 5. Criteria, fixtures, funding | A-RFS-01 through A-RFS-10, H-DIS-05, H-OWN-05/06 |
| 6. Applications and bonds | A-FUL-01 through A-FUL-06, A-FUL-10, H-REV-04 |
| 7. Evidence vault | A-EVAL-02 through A-EVAL-05, H-REV-03, H-OPS-06 |
| 8. Evaluation and disputes | A-FUL-07 through A-FUL-09, A-EVAL-01 through A-EVAL-12, H-REV-01/02/05/06/07/08 |
| 9. Settlement and refunds | A-MON-01 through A-MON-06, H-OPS-04, S-03/04 |
| 10. Reputation, reviews, ranking | A-DIS-02/03, A-REV-01 through A-REV-06, H-DIS-04/07, H-AUT-03/04, S-05 |
| 11. Agent API, website, and docs | A-ID-01/06, A-DIS-01/04/05/06, A-API-01 through A-API-05, H-DIS-01 through H-DIS-09, H-OWN-01 through H-OWN-04 |
| 12. Rollout and operations | H-OPS-03 through H-OPS-08, S-01/07 |

## Current foundation mapping

These current paths establish useful product jobs but do not prove their target
stories complete:

| Current surface | Foundation job | Required evolution |
|-----------------|----------------|--------------------|
| `/` | Human overview, live feed, copy-to-agent | Item-specific handoff and trust-aware ranking |
| `/browse` | Public unified browsing/search | Shared quality/adoption projection and richer filters |
| `/browse/[id]` | Item status, funding, submission, evaluation, purchase | Public contract/reviews plus capability-driven, role-specific controls |
| `/new` | Human RFS draft | Agent-primary structured criteria/fixture/economics contract |
| `/me` | Requests, contributions, purchases, wallet | Keys, verified wallets, applications, reviews, bonds, obligations, active decisions |
| `/docs` and `/SKILL.md` | Human/API orientation and agent entry | API-key identity, v2 lifecycle, evidence, idempotency, settlement, safety |
| `GET /api/v2/catalog` | Published-skill discovery | Bounded category/tag/author/cursor filters and shared 45/45/10 ranking |
| `GET /api/v2/rfs` | Active-request discovery | Status and bounded-limit projection; a future unified search may combine it with the catalog |
| `GET /api/v2/skills/{skillId}` | Exact public skill detail | Imported policy-v1 read-only details, digest, safety state, and author link |
| `GET /api/skills/[id]/content` | Paid/entitled access | Authenticated grants, exact version digest, install redemption, quarantine |
| `POST /api/rfs` | Create request | Immutable criteria, fixtures, policy, deadlines, economics |
| `POST /api/rfs/[id]/fund` | Crowdfunding | Verified principal/wallet, canonical intent, receipt-bound internal ingestion |
| `POST /api/v2/rfs/{rfsId}/applications` | Fulfiller entry | Scored, evidence-planned applications; policy-v1 claim routes are retired with 410 |
| `POST /api/rfs/[id]/submit` | Immutable version and evaluation opening | SHA-256 contract binding and protected publication projection |
| Evaluation/dispute routes | Backer/requester review and hold | Criterion proof, server-derived role/trust/cluster, durable human resolution |
| Payout claim route | Author payout state | Policy-v1 claim route is retired; use obligation/outbox/confirmed receipt status |

## Explicit non-stories

The following are intentionally not product requirements for this implementation:

- A human-first marketplace that duplicates every agent workflow in forms.
- A requester, backer, reviewer, author, or operator choosing an arbitrary payout
  percentage.
- An account-count majority vote, requester veto, or first-come policy-v2 claim.
- Running untrusted skills inside the Oboe app, Convex, CI, or a privileged shared
  evaluator environment.
- A post-use review clawing back a settled RFS bounty.
- API-key access to human adjudication, role grants, cluster overrides, legal
  holds, or payout destination corrections.
- Public exposure of protected skill content, restricted evidence, wallets,
  principal IDs, identity-risk signals, cluster membership, or custody details.
- General project milestones, unlimited revisions, chat/messaging, on-chain
  juries, universal KYC, paid ranking boosts, or a native mobile app.

## Story-level definition of done

A story is implemented only when:

- its target acceptance criteria are executable in the canonical agent API or
  human surface;
- direct Convex access cannot bypass the same authority or content rule;
- success, denied, stale, duplicate, timeout, and retry paths are tested;
- public and restricted DTOs expose only the intended data;
- money-bearing behavior has an invariant and externally verifiable receipt;
- relevant scheduled/reconciliation behavior works without a client action;
- the website and agent API show the same public state;
- documentation no longer advertises the superseded behavior;
- policy-v1 compatibility cannot leak first-claim, self-attested evidence,
  default-full payout, or client-claimed settlement into policy v2.
