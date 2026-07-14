# Policy-v2 Convex deployment plan

Status: Convex v2 production migration complete; Vercel redeploy is pending a
fresh personal-profile Google sign-in.

Date: 2026-07-14

## Evidence captured

- The checked-out `main` is `5ab015b` and contains the legacy policy-v1
  marketplace surface.
- The intended v2 implementation is
  `origin/johann/complete-evaluation-payout-system` at `e3249b8`.
- The live site is serving real legacy data: `GET https://www.oboe.sh/api/skills`
  returns seeded open and published catalog records.
- The live site has no v2 discovery surface yet:
  `/.well-known/oboe-agent.json` and `/api/v2/openapi.json` both return 404.
- Convex CLI access is valid for team `johann-hipp`, project `oboe`.
- Vercel production values identify `https://whimsical-dolphin-750.convex.cloud`
  as the live Convex URL, with matching site endpoint
  `https://whimsical-dolphin-750.convex.site`. This is a dev-labelled
  deployment serving production traffic and remains the immutable source.
- The source snapshot is preserved outside the repository at
  `/tmp/oboe-live-source.zip`. It contains 40 domain/auth records: 4 access
  grants, 6 contributions, 10 payment events, 4 payout entries, 4 purchases,
  4 RFSs, 2 skills, and the existing Better Auth user/account/JWKS/verification
  records.
- A new Convex project `oboe-v2` was created in team `johann-hipp`, with default
  production deployment `different-clownfish-198` at
  `https://different-clownfish-198.convex.cloud`. The full snapshot imported
  successfully before v2 schema deployment, preserving source IDs through
  Convex's remapping.
- The v2 functions, additive schema, Better Auth component, and reconciliation
  cron are deployed to `different-clownfish-198`. The v2 feature flag is
  explicitly `off`; `OBOE_MONEY_WRITES_ENABLED=false` and
  `OBOE_V2_GENERAL_AVAILABILITY_APPROVED=false` are configured.
- Read-only inventory matches the source: RFS current 27,000 / threshold
  35,500 base units; contributions 18,000; payout entries gross 20,000 / net
  19,800; purchases 20,000; payout ledger 0.
- Migration batches completed: policy-v1 tagging for RFSs, skills, and
  contributions; two immutable skill versions backfilled from existing
  content; and all legacy review scans. Eight review items remain open: two
  missing-skill-version findings and six synthetic-principal findings.
- Vercel's two public Convex variables have been updated to the `oboe-v2`
  deployment URLs, but Vercel still needs a new production deployment. The
  new `OBOE_SERVER_ENVELOPE_SECRET` is not yet present in Vercel because the
  authenticated browser session expired during the add-variable flow.

## Candidate readiness

The v2 branch passed in an isolated worktree:

```text
npm ci --include=dev   pass
npm run lint           pass
npm run typecheck      pass
npm test               pass — 27 files, 218 tests
npm run build          pass
```

The two EOF whitespace issues were fixed in the deployment branch. The full
candidate checks pass:

- `convex/lib/contracts.ts`
- `convex/lib/featureFlags.ts`

The v2 install reports six moderate npm audit findings; review and disposition
them before enabling general-availability money writes.

## Phase 0 — identify and freeze the real production target (complete)

1. Read the Vercel production values for `NEXT_PUBLIC_CONVEX_URL` and
   `NEXT_PUBLIC_CONVEX_SITE_URL` from the linked `oboe` project.
2. Resolve that Convex deployment to its team/project/deployment name with the
   Convex CLI. Confirm that its `function-spec`, table inventory, and sample
   catalog data match the live `www.oboe.sh` API.
3. Record the deployment name, URL, region, current git/deploy reference, and
   all production environment-variable names. Never copy secret values into
   this repository or a plan.
4. Export a read-only snapshot of the real deployment before any code or schema
   change. Preserve the export outside the repository.
5. If the URL resolves to a deployment outside the `oboe` Convex project,
   reconcile ownership/access first. Do not silently create a replacement
   deployment and call it production.

### Stop conditions

- The live Convex URL cannot be identified.
- The target contains money-bearing rows that cannot be reconciled to provider
  or custody records.
- The target has claimed payouts without verifiable receipts, unresolved
  disputes, or synthetic principals with no operator disposition.
- The target in the Vercel environment is not the target inspected by the CLI.

## Phase 1 — prepare and deploy v2 (complete with production gates off)

1. Merge or cherry-pick the complete v2 branch into an integration branch after
   the drift check against the intended production baseline.
2. Fix the two EOF whitespace issues and rerun the full candidate checks.
3. Provision the fresh `oboe-v2` production deployment and configure the safe
   v2 `.env.example` contract. Required groups are:

   - Convex and Better Auth: `NEXT_PUBLIC_CONVEX_URL`,
     `NEXT_PUBLIC_CONVEX_SITE_URL`, `BETTER_AUTH_SECRET`, `SITE_URL`.
   - App/payment boundary: `MPP_SECRET_KEY`, `MPP_NETWORK`,
     `MPP_FUNDING_TOKEN_ADDRESS`, `MPP_RECIPIENT_ESCROW_ADDRESS`, and keep
     `MPP_ENABLE_FEE_PAYER=false` until the nonproduction path is proven.
   - Policy gates: `OBOE_MONEY_WRITES_ENABLED=false`,
     `OBOE_V2_GENERAL_AVAILABILITY_APPROVED=false`,
     `OBOE_PLATFORM_PRINCIPAL_ID`, and `OBOE_SERVER_ENVELOPE_SECRET`.
   - External boundaries: nonproduction `OBOE_KMS_*`, `OBOE_SCANNER_*`, and
     `OBOE_CUSTODY_*` endpoints/tokens only.

4. Run `npx convex codegen` against the deployment. Generated
   files must come from the CLI, never from hand edits.
5. Import the source snapshot before deploying the new schema so Convex can
   remap legacy IDs. Deploy the v2 functions with the feature flag `off`.
6. Run the read-only legacy inventory and verify exact base-unit totals before
   allowing migration writes. Migration writes completed only for proven
   policy-v1 metadata and content-derived skill versions.

## Phase 2 — prove the v2 lifecycle before production

Use the existing nonproduction runbook and fake/testnet providers to exercise:

1. Discovery, OpenAPI, API-key/delegation boundaries, and resumable operations.
2. RFS criteria validation, competing applications, deterministic assignment,
   bond gating, immutable submissions, and versioned content.
3. Signed evidence upload, scanner/KMS failure behavior, independent evaluator
   quorum, correction supersession, harmful hold, dispute adjudication, and the
   single revision cap.
4. Exact obligation conservation, backer refunds, purchase earnings, custody
   idempotency, lost-broadcast reconciliation, and receipt-backed confirmation.
5. Final-only reputation/ranking updates and the invariant that post-use reviews
   cannot alter a settled RFS payout.
6. Legacy route isolation: v1 can finish allowed in-flight work, while v2
   resources never use v1 claim/evaluation/payout authority.

Required evidence: test deployment ID, policy/algorithm versions, fixture and
principal IDs, request IDs for failures, source-pool totals, obligation totals,
confirmed-transfer totals, and the alert snapshot.

## Phase 3 — additive production migration (complete; rollout remains gated)

1. Put production v2 in `off`; leave existing in-flight v1 RFSs on the hardened
   v1 state machine.
2. The additive v2 schema/functions and cron reconciliation are deployed without
   enabling v2 creation or money writes.
3. Paginated, read-only inventory was run for RFSs, contributions, payout ledgers
   and entries, purchases, disputes, missing skill versions, synthetic
   principals, and claimed rows without receipts.
4. The source has no payout-ledger rows; payout entries are preserved as legacy
   purchase claims and no new transfer was created.
5. Only facts proven by existing rows were backfilled. Legacy records are
   marked policy v1;
   never invent criteria, evidence, identity, reviewer quality, or payout
   outcomes.
6. `migrationReviewItems` contains eight open findings. Resolve each with
   evidence and an operator reason before cohort expansion.
7. Re-run conservation and duplicate-transfer checks. Keep a copy of the
   pre-migration export and migration progress outside the repository.

## Phase 4 — staged rollout (pending Vercel redeploy)

1. `off`: schema and migration code live; no v2 creation.
2. `shadow`: record scored-assignment comparisons against the deprecated
   first-application baseline without changing selection or settlement.
3. `cohort`: enable a named, low-value, testnet/fake-custody cohort only after
   shadow divergences are reviewed and explained.
4. Expand only after conservation, duplicate-transfer, auth, evidence-ACL,
   stuck-dispute, harmful-hold, retention, and projection alerts are zero or
   explicitly explained.
5. High-value use additionally requires staffed trusted-review/adjudication
   queues, KMS/scanner/custody monitoring, and operator approval.
6. `on`: set the Convex feature flag to `on` only when
   `OBOE_V2_GENERAL_AVAILABILITY_APPROVED=true`, the final agent guide and
   OpenAPI are validated, and production change approval is recorded.
7. Keep legacy routes as explicit `410 api_version_retired` tombstones through
   the sunset window. Remove them only after no v1 RFS remains open and telemetry
   shows no callers.

## Rollback

Rollback means disabling new v2 creation and worker broadcasting, not deleting
rows or downgrading policy versions. Preserve events, evidence holds,
obligations, and confirmed receipts; continue safe provider reconciliation.
Stop immediately on any unexplained money imbalance, duplicate receipt,
authorization bypass, missing evidence ACL, or stuck harmful hold.

## Remaining execution block

1. Have the operator complete the Google SSO flow in the personal Vercel
   browser profile.
2. Add the generated `OBOE_SERVER_ENVELOPE_SECRET` to Vercel Production only,
   then redeploy the v2 branch. Preserve all existing MPP secret values; never
   reveal or copy them into the repository.
3. Verify the production deployment points to
   `different-clownfish-198.convex.cloud` and smoke-test the public catalog,
   `/.well-known/oboe-agent.json`, `/api/v2/openapi.json`, v2 read endpoints,
   auth boundary errors, and legacy route behavior.
4. Keep v2 `off` until the eight review items, external custody/scanner/KMS
   configuration, and the Phase 2 lifecycle evidence are reviewed. Do not
   enable money writes or general availability as part of the Vercel switch.
