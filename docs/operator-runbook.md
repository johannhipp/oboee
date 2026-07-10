# Operator runbook

## Access

Use `/ops` from an interactive cookie session. Every command requires an active
role, recent passkey, reason, and confirmation of the displayed resource digest.
API keys cannot perform operator actions. Never share screenshots containing
principal IDs, target digests, wallet snapshots, or private evidence metadata.

## Triage order

1. Enable the relevant kill switch: set policy v2 `off` to stop new creation;
   stop the custody worker separately when settlement integrity is uncertain.
2. Inspect alert counts and the immutable audit log. Preserve holds and existing
   rows; do not delete events or rewrite decisions.
3. For failed/stale transfers, follow the settlement runbook. For evidence
   failures, follow evidence retention. For migration/cohort findings, follow
   migration and rollout. For identity or recovery incidents, require two
   independent security operators where specified.
4. Record request IDs, resource digests, provider references, timelines, and the
   reason for each command. Do not paste restricted artifact content into logs.

## Role administration

Grant the narrowest role/tag scope and short expiry. Never self-revoke the last
platform operator. Reviewer and adjudicator roles must be independent of the
affected author/requester clusters. Revoke compromised grants immediately and
rotate the associated Better Auth credentials separately.

## Identity correction

Use `/ops/identity` only after reviewing private signal provenance. Preview the
exact mode, source clusters, memberships, and split subset; independently check
the displayed digest before executing. Merge replaces at least two active
clusters with one cluster. Split replaces one cluster with two non-empty
clusters. Overrides expire within one year, close old memberships append-only,
and emit both identity and operator audit events. Never use a cluster override
to improve marketplace rank or satisfy an evaluation quorum.

## Shadow comparison

The lifecycle worker compares completed scored selections to the deprecated
first-application baseline without changing selection or settlement. Review
every unexplained divergence shown on `/ops` before cohort expansion. A
divergence is evidence to inspect, not an error by itself; the expected outcome
is that quality scoring often rejects first-come ordering for defensible inputs.

## Exit criteria

Do not reopen a cohort until conservation, duplicate-transfer, auth, dispute,
retention, harmful-hold, and projection alerts are zero or have documented safe
explanations. A production `on` transition also requires the deployment-level
general-availability gate and rollout approval.
