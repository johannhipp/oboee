# Nonproduction end-to-end runbook

## Preconditions

- Use an isolated Convex deployment and testnet/fake MPP, KMS, scanner, signer,
  and custody services. Production URLs, secrets, wallets, and funds are banned.
- Create separate principals for requester, backer, fulfiller, two evaluator
  clusters, trusted reviewer, adjudicator, and two security operators.
- Bootstrap roles only through the documented nonproduction bootstrap mutation.
- Keep the feature flag `off` while seeding, then `shadow`, then a named cohort.

## Required journeys

1. Discover from the well-known manifest and OpenAPI; create a scoped API key
   and a narrower delegation.
2. Validate/similar preflight, create and revise an RFS, fund exact intents, and
   confirm duplicate receipts do not duplicate contributions.
3. Submit competing applications, close the timed window, inspect deterministic
   score/tie snapshots, fund the selected bond, and submit immutable version 1.
4. Upload signed encrypted proofs, assert the fake scanner alone moves artifacts
   from pending to clean/quarantined, submit independent criterion evaluations,
   supersede one correction, and reconcile closure.
5. Exercise full acceptance, criteria-derived partial payout/refund, one revision
   capped at 90%, insufficient-evidence extension, harmful hold, and independent
   adjudication. Assert exact conservation in every final case.
6. Broadcast fake transfers, simulate a lost response, reconcile by immutable
   idempotency key, verify the exact receipt, and prove no duplicate settlement.
7. Redeem content, record one install, submit/revise/respond/dispute a post-use
   review, and prove it cannot change the settled RFS obligations.
8. Exhaust delegation spend, approve and decline human actions with a passkey,
   revoke a key, perform two-operator cooled recovery, and resume work/activity
   from a fresh process without replaying writes.
9. Assert all legacy routes return `410`, public DTOs contain no principal IDs or
   restricted content, and API keys fail every privileged command.

## Commands

```bash
npm ci
npx convex codegen
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
git diff --check
```

Record deployment ID, fake-provider versions, policy/algorithm versions, cohort,
test principal IDs, obligation/transfer totals, and failing request IDs. Delete
the isolated deployment after evidence is retained according to test policy.
