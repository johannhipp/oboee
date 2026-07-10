# Policy-v2 rollout and rollback

## Gates

1. `off`: schema/migrations deployed; no v2 creation.
2. `shadow`: the lifecycle worker records first-come versus scored-assignment
   comparisons without changing selection or settlement. Operators inspect the
   divergence rows on `/ops`.
3. `cohort`: immutable named low-value test cohort with fake/testnet custody.
4. Expand only after a complete lifecycle has zero unexplained conservation,
   duplicate transfer, auth bypass, stuck dispute, retention, harmful-hold, and
   projection incidents.
5. High value additionally requires staffed reviewer/adjudicator queues, KMS and
   custody monitoring, and explicit operator approval.
6. `on` requires the database flag, `OBOE_V2_GENERAL_AVAILABILITY_APPROVED=true`,
   final agent-guide validation, and production change approval.

## Rollback

Set creation `off` and stop new custody broadcasts. Preserve all resources,
events, evidence holds, obligations, and confirmed receipts. Continue lifecycle
and provider reconciliation where doing so cannot create duplicate money
movement. Never roll back by deleting events, downgrading policy versions, or
recalculating finalized decisions.

## Required evidence

Archive non-secret build/test results, route/OpenAPI inventory, cohort IDs,
algorithm/policy versions, alert snapshots, source-pool/obligation/receipt totals,
review staffing, and approval references. Production actions are intentionally
outside repository automation.
