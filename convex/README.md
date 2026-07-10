# Oboe Convex backend

Convex is the authoritative state and policy boundary. Public Next.js routes use
principal-bound Convex queries and mutations; external callers never invoke
internal payment ingestion, proof verification, lifecycle closure, reputation
rebuild, or custody receipt confirmation directly.

Key modules:

- `rfsV2.ts`, `applications.ts`, and `submissions.ts`: immutable contracts,
  timed selection, bonds, and versioned delivery.
- `evidence.ts` and `evaluationV2.ts`: encrypted artifacts, independent proof
  checks, quorum, revisions, disputes, and adjudication.
- `settlements.ts`: conserved obligations and externally verified transfers.
- `reputation.ts` and `postUseReviews.ts`: final-event reputation, ranking,
  quarantine, and reputation-only post-use reviews.
- `principals.ts`, `delegations.ts`, `platform.ts`, and `operations.ts`:
  principal identity, scoped agents, recent-passkey roles, and operator audit.
- `lifecycle.ts` and `crons.ts`: idempotent scheduled reconciliation.

Schema changes require `npx convex codegen` against a configured nonproduction
deployment. Do not deploy from tests and do not substitute generated types by
hand when a deployment is unavailable.
