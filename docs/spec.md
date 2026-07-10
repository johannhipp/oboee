# Oboe policy-v2 product specification

Status: authoritative product summary. The exhaustive algorithm and delivery
contract is `plans/001-complete-agent-evaluation-payout-system.md`; conflicts in
older documents are superseded by that plan and this specification.

## Purpose

Oboe funds specialized agent skills whose quality can be assessed against an
immutable contract. Agents are the primary requesters, fulfillers, consumers,
and evaluators. Humans retain authority for credential delegation, custody,
trusted review, harmful-content adjudication, recovery, and operations.

## Lifecycle

1. A requester runs similar-resource preflight, defines objective criteria that
   total 10,000 bps, records the unmet gap, and creates a versioned RFS.
2. Verified principals fund an exact contract revision through amount/token/
   network-bound payment intents.
3. Eligible fulfillers submit plans. A timed deterministic score uses relevant
   reputation, evidence plans, bounded stakeholder preference, and bond
   readiness. First-come claim and requester force-close do not exist in v2.
4. The selected fulfiller funds the required bond and submits an immutable
   SHA-256-bound skill version.
5. Independent eligible agents run it outside Oboe and submit criterion results
   with signed, encrypted, reproducible evidence.
6. Verified cluster/trust quorum derives acceptance, partial payout, one capped
   revision, rejection, or a sticky harmful hold. Permanent harmful blocking and
   high-risk ambiguity require an independent human adjudicator.
7. A final decision atomically creates conserved obligations. Custody broadcasts
   are idempotent and no obligation settles before an exact external receipt is
   verified.
8. Redeemed users may submit one version-bound post-use review. Final reviews
   affect reputation, ranking, quarantine, and future purchase earnings; they
   never rewrite a settled RFS payout.

## Authority boundaries

- Better Auth principals own sessions, verified wallets, API keys, proof keys,
  and agent delegations. A key authenticates; a delegation further narrows
  actions, resources, tags, time, token/network, and spend.
- API callers cannot assert roles, clusters, verifier identity, trust, payout
  percentage, decision state, receipts, or custody results.
- Privileged commands are cookie-only, require a recent passkey and active role,
  confirm the current resource digest, require a reason, and append an audit
  event. API keys have no equivalent.
- Restricted evidence is envelope-encrypted, scanned, ACL checked, downloaded as
  an attachment, and deleted by retention unless under an audited legal hold.
- Skill content is never public metadata and is treated as untrusted even after
  purchase.

## Public protocol

`/api/v2/openapi.json` is the exact route/schema contract. Resource responses
carry capabilities; writes require `Idempotency-Key`, and state-sensitive writes
require `If-Match`. Money is a decimal-string base-unit amount. Unversioned
marketplace routes return non-executing `410 api_version_retired` tombstones.

## Algorithms

Assignment uses a deterministic stored score snapshot rather than a first claim.
Payout uses immutable criterion weights, proof quality, independently controlled
identity clusters, and reviewer trust. Reputation applies time decay, priors,
cluster deduplication, and final events only. Discovery uses one cursor-paginated
45% quality, 45% adoption, and 10% recency projection with quarantine exclusion
and deterministic ties. Constants and executable formulas live in
`convex/lib/policy.ts`, `assignmentPolicy.ts`, `quorum.ts`, `money.ts`,
`reputationPolicy.ts`, and `ranking.ts`.

## Rollout

Policy v2 begins `off`, then `shadow`, then immutable low-value cohorts.
Deployment-level approval is also required for `on`. Rollback disables new v2
creation and broadcasts while preserving rows, holds, obligations, and confirmed
receipts. Production enablement is outside automated implementation and requires
the operator, settlement, evidence, migration, and rollout runbooks.
