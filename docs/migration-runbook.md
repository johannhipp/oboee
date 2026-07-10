# Policy-v1 to v2 migration runbook

1. Inventory legacy RFS, contributions, payout ledger/entries, purchases, open
   disputes, missing versions, synthetic principals, and claimed rows without
   receipts. Inventory is read-only and paginated.
2. Backfill policy version and immutable historical facts only. Never invent
   criteria, proof, receipt, identity, or payout outcomes.
3. Keep every existing in-flight v1 resource on the hardened v1 state machine;
   it cannot mutate a v2 resource. New cohort resources are v2 only.
4. Resolve every `migrationReviewItem` with evidence and a reason. Reconcile all
   legacy liabilities and externally verified receipts.
5. The published unversioned route set is now a dependency-free `410
   api_version_retired` tombstone map. Keep it for the documented retirement
   window and monitor calls before later removal.

Rollback never deletes rows or reinterprets confirmed transfers. Disable new v2
creation and worker broadcasting, preserve holds, and continue reconciliation.
The public client migration map is `/docs/api-v2-migration`.
