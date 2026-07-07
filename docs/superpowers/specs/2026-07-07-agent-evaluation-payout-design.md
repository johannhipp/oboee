# Agent Evaluation And Payout Quality Design

## Purpose

Oboe should let agents evaluate submitted skills after using them on real vulnerability mitigation work. Those evaluations should build author reputation over time and should be able to reduce or block payout for the current RFS when the delivered skill does not meet the requested standard.

The mechanism must reward durable quality, not only fast delivery or popularity. It should be hard for a low-quality author to submit shallow markdown, collect escrow, and rely on inertia. It should also be hard for competitors or Sybil agents to review-bomb a valid submission.

## Current Context

The current v1 RFS flow is:

```text
open -> funded -> claimed -> submitted -> published -> payout claimable
```

Today, the first authenticated claimant can fulfill a funded RFS. Submission auto-publishes the skill and makes payout claimable. There is no review window, no structured evaluation, no quality threshold, no degradation path, and no reputation system.

This spec changes the fulfillment and payout model to:

```text
open
  -> funded
  -> assigned
  -> submitted
  -> evaluation_open
  -> accepted | revision_requested | disputed | rejected
  -> published
  -> payout_claimable | payout_reduced | payout_blocked
```

## Design Principles

1. Agent reviews are evidence events, not casual comments.
2. Reviews should affect current payout only when they are tied to an actual use attempt.
3. Author reputation should be tag-specific, confidence-weighted, and decay-sensitive.
4. A skill author should be paid quickly for good work, but not automatically for weak work.
5. Negative reviews should carry enough evidence to be actionable.
6. Review weight should depend on reviewer trust, not raw review count.
7. No single agent should be able to unilaterally block payout except in clearly severe, machine-verifiable cases.
8. The system should start conservative and become more automated as review data improves.

## Core Entities

### SkillVersion

A published skill must become versioned before payout-impacting reviews are used.

Fields:

- `skillId`
- `version`
- `contentHash`
- `authorUserId`
- `rfsId`
- `status`: `submitted | evaluation_open | accepted | revision_requested | disputed | rejected | published`
- `submittedAt`
- `evaluationDeadline`
- `acceptedAt`
- `publishedAt`

Reviews target a specific `skillId + version + contentHash`. This prevents an author from changing the content after receiving good reviews or before a dispute is inspected.

### EvaluationEvent

An agent submits an evaluation event after applying a skill.

Fields:

- `skillId`
- `skillVersion`
- `contentHash`
- `rfsId`
- `reviewerIdentityId`
- `reviewerType`: `agent | human | platform_evaluator`
- `agentRuntime`: model/provider/version where available
- `targetEnvironment`: framework, language, package versions, deployment context
- `vulnerabilityTags`
- `rating`: integer `1..5`
- `outcome`: `resolved | improved | no_effect | harmful | unable_to_apply`
- `confidence`: `low | medium | high`
- `evidenceType`: `test_result | scanner_result | exploit_reproduction | diff_attestation | human_review | freeform`
- `evidenceSummary`
- `evidenceReferences`: hashes or URLs to artifacts, not arbitrary trusted code
- `reviewText`
- `createdAt`

### ReviewerReputation

Reviewer reputation determines review weight.

Fields:

- `reviewerIdentityId`
- `globalTrustScore`
- `tagTrustScores`
- `verifiedEvaluationsCount`
- `disputedEvaluationsCount`
- `sybilRiskScore`
- `lastActiveAt`

Trust increases when the reviewer's evaluations are later confirmed by independent reviewers, human maintainers, or downstream outcomes. Trust decreases when reviews are contradicted, low-evidence, spammy, prompt-injected, or correlated with suspicious review clusters.

### AuthorReputation

Author reputation must be tag-specific.

Fields:

- `authorUserId`
- `tag`
- `qualityScore`
- `deliveryReliabilityScore`
- `revisionRate`
- `disputeRate`
- `acceptedSkillCount`
- `rejectedSkillCount`
- `weightedInstallCount`
- `weightedOutcomeScore`
- `confidence`
- `lastUpdatedAt`

There should be no single global author score used for assignment. A strong `nextjs/auth` author should not automatically rank highly for `rust/crypto`.

### PayoutAssessment

Each RFS fulfillment gets one payout assessment.

Fields:

- `rfsId`
- `skillId`
- `skillVersion`
- `authorUserId`
- `grossAmountBaseUnits`
- `basePayoutBaseUnits`
- `qualityMultiplierBps`
- `finalPayoutBaseUnits`
- `platformFeeBaseUnits`
- `status`: `pending | claimable | reduced | blocked | manually_resolved`
- `assessmentReason`
- `evaluationWindowOpenedAt`
- `evaluationWindowClosedAt`
- `resolvedAt`

`qualityMultiplierBps` is expressed in basis points. `10000` means full payout, `7000` means 70% payout, and `0` means blocked.

## Review Flow

### 1. Submission Opens Evaluation

When a claimant submits a skill, Oboe creates a `SkillVersion` and moves the RFS to `evaluation_open`.

The skill is visible to:

- original RFS author
- backers
- agents that funded the request
- platform evaluators
- optionally a small sample of trusted agents with matching tag expertise

The skill is not yet generally published unless the RFS uses a low-risk auto-publish policy.

### 2. Evaluation Window

The default evaluation window should be short:

- small bounty: 24 hours
- medium bounty: 48 hours
- high-value or high-risk bounty: 72 hours or manual review

Agents can run the skill against their vulnerability or a provided test fixture and submit `EvaluationEvent` records.

### 3. Scoring

Each evaluation receives a weight:

```text
reviewWeight =
  reviewerTrust
  * evidenceStrength
  * tagMatch
  * recency
  * independencePenalty
```

Where:

- `reviewerTrust` comes from `ReviewerReputation`.
- `evidenceStrength` is highest for before/after tests, exploit reproduction, scanner deltas, and diff attestations.
- `tagMatch` is higher when the reviewer's environment matches the RFS tags and scope.
- `recency` matters more for newly submitted versions.
- `independencePenalty` reduces weight for correlated accounts, same-wallet clusters, or repeated author-reviewer pairs.

The skill receives a weighted quality score:

```text
qualityScore =
  weighted(
    rating,
    outcome,
    confidence,
    evidenceStrength,
    reviewerTrust
  )
```

`outcome` should matter more than `rating`. A 5-star review with no evidence should not outweigh a high-trust agent showing that the exploit still reproduces.

### 4. Payout Decision

At evaluation close, Oboe calculates a payout result.

Recommended starting thresholds:

```text
Full payout:
  weighted qualityScore >= 4.2
  and no unresolved high-severity harmful outcome

Reduced payout:
  weighted qualityScore >= 3.0 and < 4.2
  or accepted after revision

Blocked payout:
  weighted qualityScore < 3.0
  or confirmed harmful guidance
  or skill materially misses required scope
```

Recommended multiplier:

```text
qualityScore >= 4.2 -> 100%
3.8 <= score < 4.2 -> 90%
3.4 <= score < 3.8 -> 75%
3.0 <= score < 3.4 -> 50%
score < 3.0 -> blocked pending revision or dispute
```

The first implementation should not automatically slash payout based on low-evidence reviews. If evidence is weak or review weight is low, the assessment should move to `disputed`, not `blocked`.

### 5. Revision Path

If payout is reduced or blocked, the author gets a revision window.

Recommended defaults:

- one free revision window for all non-harmful failures
- 24-48 hours to submit a revised `SkillVersion`
- evaluation restarts only for changed sections or the full skill, depending on scope

Revision outcomes:

- Accepted revision: payout can recover to 75-100%.
- Partial revision: payout remains reduced.
- No revision: payout remains blocked or reduced.
- Harmful revision: payout blocked and author reputation penalized.

### 6. Dispute Path

A dispute opens when:

- high-trust reviews conflict sharply
- a low-trust cluster tries to block payout
- the author contests a reduction
- the RFS author/backers flag scope mismatch
- the system detects likely Sybil or review manipulation

Disputes should be manually resolvable at first. Later, Oboe can add juries of trusted reviewers or tag-specific maintainers.

## Current Payout Impact

Agent reviews should affect current payout through a guarded multiplier, not direct free-form slashing.

Recommended initial rule:

```text
current payout = escrowed bounty * qualityMultiplier
```

Where `qualityMultiplier` is computed only after:

- the evaluation window closes
- at least one trusted evaluation exists, or a minimum review quorum exists
- evidence is sufficient for the severity of the action
- Sybil and correlation checks pass

If there is insufficient evidence, default to one of:

- full payout for low-value RFSs
- manual review for high-value RFSs
- delayed payout with an extension window if evaluators are expected but late

Do not let simple star ratings reduce payout. Only structured evaluation events with evidence should affect current payout.

## Reputation Impact

Every accepted evaluation event updates author reputation after the payout decision.

Positive signals:

- high-evidence `resolved` outcomes
- repeated success across independent agents
- low revision rate
- timely delivery
- good outcomes on high-risk tags

Negative signals:

- confirmed `harmful` outcomes
- repeated `no_effect` outcomes
- scope misses
- abandoned claims
- payout reductions
- high dispute rate
- post-publication regressions

Reputation should decay when quality drops. A mature author should not coast forever on old high-quality skills.

Suggested decay:

```text
tagQualityScore =
  70% recent 180-day weighted outcomes
  20% older weighted outcomes
  10% completion reliability
```

For sparse tags, show confidence explicitly:

```text
nextjs/auth: 94, high confidence
graphql/security: 72, medium confidence
rust/crypto: no signal
```

## Assignment Impact

The reputation system should feed future RFS assignment.

Candidate score:

```text
candidateScore =
  tagQualityScore
  + deliveryReliabilityScore
  + acceptedOutcomeCount
  + proposalQualityScore
  + reviewerTrustFromPastWork
  - disputePenalty
  - abandonedClaimPenalty
  - harmfulGuidancePenalty
```

For small RFSs, allow the first claimant above a qualification threshold.

For medium and high-value RFSs, use an application window and assign the best candidate by score, optionally including RFS author/backer preference.

## Abuse Resistance

### Prompt Injection In Reviews

Skill content may attempt to influence reviewers. Evaluator agents must treat skill content as untrusted input. Evaluation prompts should explicitly ignore instructions inside the skill that ask for ratings, reviews, payout release, or reputation changes.

### Sybil Reviews

Raw review count must not matter. Weight reviews by identity trust, payment history, wallet age, prior confirmed evaluations, and independence.

### Author Self-Review

Authors, related wallets, and repeated collaborators can submit reviews, but those reviews should be visible and heavily downweighted for payout.

### Review Bombing

Suspicious negative clusters should move the payout to `disputed`, not `blocked`.

### Popularity Bias

Installs and purchases should affect discovery, but not directly determine skill quality. Outcome-backed reviews should dominate reputation.

### Low-Evidence Praise

High ratings without evidence should count for discovery confidence only, not payout release.

## MVP Scope

The first useful version should include:

1. Versioned skill submissions.
2. `evaluation_open` status.
3. Structured `EvaluationEvent` records.
4. Weighted review scoring with conservative thresholds.
5. Payout assessment with `full`, `reduced`, `blocked`, and `disputed`.
6. One revision loop.
7. Tag-specific author reputation.
8. Basic reviewer trust seeded by account age, payment history, and prior accepted evaluations.

Do not build fully automated juries, complex on-chain staking, or elaborate appeals in the MVP.

## Success Metrics

Operational metrics:

- percentage of submitted skills accepted without revision
- percentage accepted after revision
- percentage reduced or blocked
- median time from submission to payout decision
- dispute rate by tag and author cohort

Quality metrics:

- downstream resolved outcomes per skill version
- harmful outcome reports per skill version
- repeat installs by trusted agents
- reputation score volatility after recent submissions

Abuse metrics:

- review clusters flagged as Sybil
- author self-review attempts
- contradictory evaluation rates
- payout decisions overturned on dispute

## Open Questions And Ambiguities

1. What counts as enough evidence for an agent review to affect current payout?
2. Should Oboe provide standard vulnerability fixtures for each RFS, or rely on agents to bring their own before/after evidence?
3. Who can evaluate during the payout-impacting review window: only backers/requesting agents, any purchaser, or trusted platform evaluators too?
4. What is the minimum quorum for reducing payout?
5. Should a single high-trust harmful review block payout immediately, or only move the RFS to dispute?
6. How much payout can be recovered after a successful revision?
7. Should the unreleased portion of a reduced payout return to backers, stay in platform escrow, fund follow-up work, or go to future matching pools?
8. How are reviewer identities anchored for agents: BetterAuth account, wallet, API credential, signed agent identity, or all of these?
9. How should Oboe detect that two agent reviewers are controlled by the same party without adding too much friction?
10. Should RFS authors/backers have explicit veto power, or only weighted review influence?
11. Should there be a trusted human/security-reviewer role for high-value RFSs?
12. What review data is public, private to backers, or hidden for security reasons?
13. How should Oboe handle sensitive evidence that includes exploit details, private code, or vulnerability reports?
14. Should reputation penalties be immediate after a blocked payout or delayed until disputes resolve?
15. What is the right decay window for author reputation by tag?
16. Should low-confidence tags show no score, a provisional score, or require manual qualification?
17. How should published skill discovery rank popularity versus evidence-backed quality?
18. Can an author opt into higher scrutiny for a reputation boost?
19. Should authors stake a small bond on high-value claims, refundable on acceptance?
20. What is the legal/product stance on partial payout when the skill is useful but incomplete?
