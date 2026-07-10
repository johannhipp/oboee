# Agent and Human Surface Traceability

Companion to `001-complete-agent-evaluation-payout-system.md`. This matrix is
the implementation audit for every story in `docs/agent-first-user-stories.md`.
`Covered` means the original algorithm plan already had the required behavior.
`Added` means the surface audit added protocol, UI, shared-read-model, security,
or verification work. `Intentional asymmetry` means the missing surface is a
security or product boundary and must be tested as absent.

## Consistency rules

- Agent and human reads use the same projection builders, policy snapshots, and
  capability engine. Neither surface recomputes ranking, money, or state.
- Agent execution and high-volume mutations remain API-first. Human pages may
  inspect, authorize, fund as a secondary path, or hand work to an agent; they
  do not execute untrusted skills.
- Custody approvals, account recovery, high-value confirmation, adjudication,
  role administration, cluster override, legal hold, and destination correction
  are human-only, recent-passkey actions. API keys can request and observe them
  but cannot execute them.
- Internal services have no public command equivalent. Their state is visible
  through safe resource projections and operator reconciliation.

## Agent stories

| Story | Agent protocol | Human surface | Audit | Implementation target |
|-------|----------------|---------------|-------|-----------------------|
| `A-ID-01` | Well-known manifest and OpenAPI lead to the final task guide | Generated `/docs` and public handoff point to the same contract | Added | Step 11A.2-4; Step 13 |
| `A-ID-02` | Scoped key resolves the owner's principal | `/me/agents` creates and manages scoped keys | Added | Step 3.2-4; Step 11B.13 |
| `A-ID-03` | Stable auth/permission errors name minimum permission | Owner action view explains the bounded grant without leaking resource data | Added | Step 11A.4, 11A.8; API contract tests |
| `A-ID-04` | Wallet challenges, bound payment intents, safe obligation status | `/me/wallets` verifies and manages wallet purposes | Added | Step 3.5; Step 4; Step 11B.13 |
| `A-ID-05` | Revoked keys fail; principal grants and signing-key history persist | Key rotation/revocation and history in `/me/agents` | Added | Step 3.2, 3.6; Step 11B.13 |
| `A-ID-06` | Digest-bound `human_action_required` resource is resumable | `/me/actions` approves or declines with recent passkey | Added | Step 3.7; Step 11A.7-9; Step 11B.13 |
| `A-DIS-01` | Unified cursor catalog with filters | `/browse` uses the same projection and URL filters | Added | Step 10.6; Step 11A.5, 11B.10-11 |
| `A-DIS-02` | Ranked result exposes 45/45/10 components and tie data | Browse/detail render the same component values | Covered | Step 10.6-7; Step 11B.10-11 |
| `A-DIS-03` | Score, confidence, independent count, and separate author reputation | Public trust summary uses identical labels and values | Added | Step 10.7-8; Step 11B.11 |
| `A-DIS-04` | Exact version, digest, compatibility, price, and quarantine | Skill detail and safe-use warning mirror the public DTO | Added | Step 4.7; Step 8.10; Step 10.5; Step 11B.11 |
| `A-DIS-05` | RFS detail exposes criteria, fixtures, economics, deadlines, policy | RFS detail progressively renders the same contract | Added | Step 5; Step 11A.5, 11B.11 |
| `A-DIS-06` | Validate/similar preflight records considered items and gap | New-RFS flow shows suggestions and permits explained continuation | Added | Step 5.1; Step 11A.6, 11B.14 |
| `A-USE-01` | Canonical idempotent purchase intent and verified receipt | Human purchase/funding is a secondary use of the same intent | Covered | Step 4.1-6; Step 11A.5, 11B.14 |
| `A-USE-02` | Convex enforces author/backer/evaluator/purchaser grants | Detail page shows entitlement state but cannot bypass content route | Covered | Step 4.7; Step 11A.5 |
| `A-USE-03` | Content redemption records one deduplicated install | Public UI shows aggregate adoption only | Covered | Step 10.3; Step 11A.5 |
| `A-USE-04` | Content response binds immutable version and SHA-256 digest | Human detail exposes digest for inspection/handoff | Covered | Step 7.3; Step 8.10; Step 11B.11 |
| `A-USE-05` | Final `SKILL.md` requires isolated execution and typed outcomes | Web renders warnings; it never runs or inlines skill content | Intentional asymmetry | Step 7; Step 11B.12, 11B.17; Step 13 |
| `A-USE-06` | Quarantine response pauses access/sales and selects valid fallback | Detail shows redacted quarantine and compatibility warning | Added | Step 10.5; Step 11B.11 |
| `A-RFS-01` | Create contract command requires scope, environment, tags, limits, economics | Human draft can seed/handoff the same structured contract | Added | Step 5; Step 11A.6, 11B.14 |
| `A-RFS-02` | Criteria schema validates objective tests and exact weights | Form provides criterion editor and 10,000-bps validation | Added | Step 5.2-3; Step 11B.14 |
| `A-RFS-03` | Fixture upload/version metadata and protected access | Draft/detail show safe metadata; authorized download stays controlled | Added | Step 5.5; Step 7; Step 11B.14 |
| `A-RFS-04` | Economics DTO separates pools, fees, bond policy, and refunds | RFS draft/detail and approval show the same breakdown | Added | Step 5.2, 5.7-8; Step 11B.11, 11B.14 |
| `A-RFS-05` | Payment intent binds frozen revision/digest | Human revision preview identifies challenged immutability | Added | Step 4.2; Step 5.4, 5.7; Step 11B.14 |
| `A-RFS-06` | Authenticated funding intent with wallet and atomic reservation | Item page can fund through the identical command as a secondary path | Covered | Step 4.1-6; Step 11B.14 |
| `A-RFS-07` | Late verified receipts become funding or refund; replay is idempotent | Owner/operator views explain late-refund state | Covered | Step 4.1-4; Step 11B.13, 11B.16 |
| `A-RFS-08` | RFS state, deadlines, capabilities, events, and safe polling | Detail and activity render the same lifecycle/decision/settlement state | Added | Step 11A.6, 11A.8-10; Step 11B.10-13 |
| `A-RFS-09` | Refund obligations and transfer status are queryable | Owner earnings and RFS settlement panels show the same obligations | Added | Step 5.6; Step 9; Step 11B.13-14 |
| `A-RFS-10` | Append revision/cancel commands enforce commitment boundaries | Draft editor shows current revision, freeze, and cancellation consequence | Added | Step 5.4; Step 11A.6, 11B.14 |
| `A-FUL-01` | Application command replaces first claim for v2 | Detail offers application only from returned capability | Added | Step 6.1-3; Step 11A.6, 11B.14 |
| `A-FUL-02` | Eligibility preflight returns safe stable reason codes | Human oversight can see why its agent is blocked without risk signals | Added | Step 6.2; Step 11A.6 |
| `A-FUL-03` | Stored score inputs/components/rank/ties are queryable | Assignment panel shows the immutable snapshot | Covered | Step 6.5; Step 11B.14 |
| `A-FUL-04` | Endorsement command affects bounded preference only | Backer item view uses same capability and shows bounded effect | Added | Step 6.4; Step 11A.6, 11B.14 |
| `A-FUL-05` | Assignment resource exposes selected/waitlisted/ineligible reason safely | Owner activity and assignment panel show identical result | Added | Step 6.5-8; Step 11A.6, 11B.13-14 |
| `A-FUL-06` | Bond intent and receipt state are resource-bound | Owner approval/bond status uses the same intent and obligations | Added | Step 6.6-7; Step 11B.13-14 |
| `A-FUL-07` | Submission creates immutable digest-bound version | Oversight page previews metadata/digest, not executable inline content | Added | Step 7.3; Step 8.10; Step 11A.6, 11B.14 |
| `A-FUL-08` | One revision command binds superseding version and 90% ceiling | Author oversight shows criterion feedback, deadline, and ceiling | Added | Step 8.8; Step 11B.14 |
| `A-FUL-09` | Missed deadline opens human abandonment action after grace | Owner sees pending decision; trusted human resolves fixed facts | Added | Step 6.9; Step 11B.13, 11B.15 |
| `A-FUL-10` | Application revisions/withdrawal are append-only before close | Application panel shows revision and withdrawal capability | Added | Step 6.3; Step 11A.6, 11B.14 |
| `A-EVAL-01` | Workspace eligibility is server-derived with safe reason codes | RFS page reflects capability without exposing cluster logic | Added | Step 8.2; Step 11A.6, 11B.14 |
| `A-EVAL-02` | Temporary workspace grants exact submission/fixtures/evidence scope | Human page shows assignment metadata; agents perform execution externally | Intentional asymmetry | Step 7; Step 8.6; Step 11A.6-7 |
| `A-EVAL-03` | Manifest binds standard fixture/runtime/result | No web execution control; trusted human may inspect reproduced facts | Intentional asymmetry | Step 7.3-4; Step 11B.15 |
| `A-EVAL-04` | Supplementary private proof can be uploaded and linked | Authorized reviewer gets controlled download, not inline execution | Intentional asymmetry | Step 7.1-7; Step 11B.15, 11B.17 |
| `A-EVAL-05` | Upload intent encrypts, scans, quarantines, and audits | Reviewer UI displays scan/access state and safe attachment controls | Added | Step 7; Step 11B.15, 11B.17 |
| `A-EVAL-06` | Criterion-level evaluation accepts evidence, not authority | Human reviewer uses the same criterion model for assigned work | Covered | Step 8.1-4; Step 11B.15 |
| `A-EVAL-07` | Correction appends a superseding evaluation | UI shows supersession history and corrected current record | Added | Step 8.3; Step 11A.6, 11B.14-15 |
| `A-EVAL-08` | Reduction is computed from cluster/trust/proof quorum | Public/owner UI explains satisfied quorum without exposing clusters | Covered | Step 8.4; Step 11B.10-11 |
| `A-EVAL-09` | Qualified harmful proof creates immediate sticky hold | Public redaction and human adjudication queue reflect the hold | Added | Step 8.5-7; Step 11B.11, 11B.15 |
| `A-EVAL-10` | Silence extends once, assigns reviewer, and keeps funds held | Owner/reviewer/operator queues expose overdue state | Added | Step 8.9; Step 11B.13, 11B.15-16 |
| `A-EVAL-11` | Trusted assignment accept/decline/workspace/complete resources | Human trusted-review queue uses same assignment and independence state | Added | Step 8.6; Step 11A.7, 11B.15 |
| `A-EVAL-12` | Eligible party opens dispute and appends evidence | Item/author UI can open/observe; only assigned human resolves | Added | Step 8.7; Step 11A.6, 11B.14-15 |
| `A-REV-01` | Redeemed principal submits one post-use review/version | Public review page and author workspace show pending/final status | Added | Step 10.4; Step 11A.7, 11B.11-13 |
| `A-REV-02` | Review evidence uses the same proof/artifact boundary | Public projection shows verified references/redaction only | Covered | Step 7; Step 10.4; Step 11B.11 |
| `A-REV-03` | Review is public pending, then finalizes after seven days | Review deep link clearly separates visible from reputation-effective | Added | Step 10.4, 10.8; Step 11B.11 |
| `A-REV-04` | Later harmful report can quarantine exact version | Human adjudication and operator hold queues handle permanent outcome | Added | Step 10.5; Step 11B.15-16 |
| `A-REV-05` | Reputation response exposes score/confidence/count and source summaries | Skill/author/reputation pages explain finalized consequences | Added | Step 10.7-9; Step 11B.11, 11B.13 |
| `A-REV-06` | Author response/dispute commands are principal and version bound | Author workspace provides one response and evidence-backed dispute | Added | Step 10.4; Step 11A.7, 11B.13 |
| `A-MON-01` | Decision DTO exposes criterion weights and conserved allocation | Settlement panel renders identical decision math | Added | Step 9.1-2, 9.9; Step 11B.10, 11B.14 |
| `A-MON-02` | Final decision automatically creates author obligation | Earnings page observes it; no payout-claim button exists | Added | Step 9.3-5, 9.9; Step 11B.13 |
| `A-MON-03` | Per-contribution largest-remainder refund obligations are queryable | Sponsor earnings and item settlement explain refund source/status | Added | Step 9.1-2, 9.9; Step 11B.13-14 |
| `A-MON-04` | Bond obligation follows fixed adjudicated slash matrix | Author/reviewer views preview policy-derived consequence only | Added | Step 6.6; Step 9.1-2; Step 11B.15 |
| `A-MON-05` | Rolling purchase-earning batches remain resumable | `/me/earnings` separates batches from RFS bounty | Added | Step 9.8-9; Step 11B.13 |
| `A-MON-06` | Failed transfer stays visible and retries by immutable obligation | Owner and operator views show safe failure/reconciliation state | Added | Step 9.4-7, 9.9; Step 11B.13, 11B.16 |
| `A-API-01` | Every actionable resource returns general capability descriptors | All controls render from the same capabilities | Added | Step 11A.8; Step 11B.10 |
| `A-API-02` | Every write requires replay-safe idempotency | Human controls generate/persist keys and prevent double submit | Added | Step 11A.4, 11A.9; route tests |
| `A-API-03` | Stable envelopes include actionable retired-route errors and 401/403/409/410/422 codes | Forms map the same field/state errors to accessible summaries | Added | Step 11A.1-4; Step 11B.18; Steps 12-13 |
| `A-API-04` | Queries/operations poll with ETag/cursor/next time and no writes | Realtime pages observe the same state without transition side effects | Added | Step 11A.9; Step 11B.10 |
| `A-API-05` | `/me/work` and cursor activity recover active workflows | `/me/activity` is the human view of the same event stream | Added | Step 9.9; Step 10.9; Step 11A.7-9, 11B.13; Step 13 |

## Human stories

| Story | Agent protocol counterpart | Human surface | Audit | Implementation target |
|-------|----------------------------|---------------|-------|-----------------------|
| `H-DIS-01` | Unified catalog and public projections | Home leads with concise position plus live requests/skills | Added | Step 11B.10-11 |
| `H-DIS-02` | Well-known manifest and canonical resource IDs | General and item-specific safe copy-to-agent actions | Added | Step 11A.3; Step 11B.12; Step 13 |
| `H-DIS-03` | Public catalog needs no principal | Public search/filter/detail without sign-in | Added | Step 11A.5; Step 11B.11 |
| `H-DIS-04` | Quality/adoption/reputation/evidence DTO | Progressive trust view with source deep links | Added | Step 10.7-8; Step 11B.11 |
| `H-DIS-05` | Public RFS contract/progress/capabilities | Plain-language criteria/economics/deadline view | Added | Step 5.8; Step 11B.11 |
| `H-DIS-06` | Stable opaque IDs and canonical links | Canonical RFS/skill/author/review pages | Added | Step 11A.5; Step 11B.11-12 |
| `H-DIS-07` | Quarantine/compatibility/confidence fields | Prominent, non-dismissed safe-use status and handoff warning | Added | Step 10.5; Step 11B.11-12 |
| `H-DIS-08` | Complete machine DTO stays explicit | Human page progressively discloses technical/economic evidence | Added | Step 11B.11 |
| `H-DIS-09` | Protocol is viewport independent | Keyboard-accessible responsive discovery and handoff | Added | Step 11B.18; Step 11C.21 |
| `H-OWN-01` | Public reads are anonymous; protected commands authenticate | Authentication appears only at protected action boundary | Covered | Step 3; Step 11B.11, 11B.13 |
| `H-OWN-02` | Scoped key/delegation contract | `/me/agents` manages scope, budget, expiry, rotation, revoke | Added | Step 3.2-3; Step 11B.13 |
| `H-OWN-03` | Wallet challenge and immutable obligation snapshot | `/me/wallets` manages proof, purpose, rotation warnings | Added | Step 3.5; Step 11B.13 |
| `H-OWN-04` | Principal work/activity resources | `/me` and `/me/activity` cover all active roles and transitions | Added | Step 11A.7-9; Step 11B.13 |
| `H-OWN-05` | Agent creates bounded human action request | `/me/actions` previews digest, scope, spend ceiling, expiry | Added | Step 3.7; Step 11B.13 |
| `H-OWN-06` | Same canonical funding intent as agent | Item page offers direct funding as secondary path | Added | Step 4; Step 11B.14 |
| `H-OWN-07` | Agent keys only observe recovery state | Dedicated cooled recovery with prior wallet proof and two approvals | Added + intentional asymmetry | Step 3.8; Step 11A.7, 11B.13 |
| `H-AUT-01` | Agent validate/similar/create/revise contract flow | Human seeds/reviews structured draft and hands execution to agent | Added | Step 5.1-4; Step 11B.14 |
| `H-AUT-02` | Submission/revision/evaluation/activity resources | Author workspace oversees immutable version and criterion feedback | Added | Step 8; Step 11B.13-14 |
| `H-AUT-03` | Author response and evidence-backed dispute commands | Author review page exposes one response/dispute | Added | Step 10.4; Step 11B.13 |
| `H-AUT-04` | Explainable reputation source projection | `/me/reputation` shows finalized sources, decay, confidence, effects | Added | Step 10.8-9; Step 11B.13 |
| `H-REV-01` | Agent trusted-review assignment resource | `/review` queue shows bounded reason/scope/deadline/fee | Added | Step 8.6; Step 11B.15 |
| `H-REV-02` | Agent can accept/decline assigned machine review within scope | Recent-passkey human declares conflict for adjudication | Added + intentional asymmetry | Step 8.6-7; Step 11B.15 |
| `H-REV-03` | Controlled evidence download with access audit | Reviewer workspace uses attachment-only decrypted access | Added | Step 7.7; Step 11B.15, 11B.17 |
| `H-REV-04` | Agent receives pending human-action state only | Human confirms top candidate or enumerated rejection | Added + intentional asymmetry | Step 6.7; Step 11B.15 |
| `H-REV-05` | Agent may add evidence but not resolve | Human selects fixed evidence-bound resolution | Added + intentional asymmetry | Step 8.7; Step 11B.15 |
| `H-REV-06` | Public API exposes redacted finalized decision | Human must publish safe rationale with hash references | Added | Step 7.6; Step 8.7; Step 11B.15 |
| `H-REV-07` | Policy computes payout/reputation/bond from factual resolution | UI previews fixed consequence and accepts no arbitrary numeric penalty | Added + intentional asymmetry | Step 8.7; Step 11B.15 |
| `H-REV-08` | Agent observes high-value hold/final result | Recent-passkey human confirms verified criterion record | Added + intentional asymmetry | Step 8.4-7; Step 11B.15 |
| `H-OPS-01` | No role-grant API-key capability | `/ops/roles` grants tag/time-bounded audited roles | Added + intentional asymmetry | Step 3.9; Step 11B.16 |
| `H-OPS-02` | Public/agent DTOs omit risk and clusters | `/ops/identity` explains and audits merge/split overrides | Added + intentional asymmetry | Step 3.10-11; Step 11B.16 |
| `H-OPS-03` | Agents see only their intent/receipt outcome | `/ops/payments` reconciles provider receipts to ledgers | Added + intentional asymmetry | Step 4; Step 11B.16 |
| `H-OPS-04` | Agents see safe obligation/transfer status | `/ops/settlements` reconciles pools, obligations, transfers | Added + intentional asymmetry | Step 9; Step 11B.16 |
| `H-OPS-05` | Agents see own due state/activity | `/ops` queues overdue workflows and projection lag | Added + intentional asymmetry | Step 8.9; Step 12.8; Step 11B.16 |
| `H-OPS-06` | Agent cannot place hold or delete evidence | `/ops/evidence` controls retention/legal holds with audit | Added + intentional asymmetry | Step 7.8; Step 11B.16 |
| `H-OPS-07` | Discovery declares active/sunset policy versions | `/ops/migrations` shows shadow/cohort/reconciliation gates | Added + intentional asymmetry | Step 2.5; Step 12; Step 11B.16 |
| `H-OPS-08` | Agent receives stable unavailable/held state | `/ops` kill switches/holds preserve append-only history | Added + intentional asymmetry | Step 12.7-8; Step 11B.16 |

## Platform-service stories

| Story | Agent/human observation | Internal authority | Audit | Implementation target |
|-------|-------------------------|--------------------|-------|-----------------------|
| `S-01` | Resource/activity state exposes due and reconciled transitions | Scheduled idempotent jobs plus indexed reconciliation cron | Covered | Steps 5-10; Step 12.8 |
| `S-02` | Public/principal/reviewer projections expose safe event history | Append-only events retain actor, state, snapshot, policy, correlation | Covered | Step 2; Steps 5-10 |
| `S-03` | Decision/settlement views expose conserved totals | Pure integer allocation and invariant checks are authoritative | Covered | Step 1; Step 9 |
| `S-04` | DTOs separate workflow, decision, obligation, and transfer | Separate state machines and outbox settlement | Covered | Step 1; Step 9; API rules |
| `S-05` | Agent/web use rebuilt quality/reputation/discovery projections | Immutable events rebuild every snapshot | Covered | Step 10; Step 11B.10 |
| `S-06` | Each actor receives a role-appropriate safe projection | Convex enforces public/content/evidence/operator boundaries | Added | Step 4.7; Step 7; Step 11B.10, 11B.17 |
| `S-07` | Surfaces show unavailable/held state without unsafe fallback | Missing payment, KMS, scanner, reviewer, or signer fails closed | Covered | Steps 4, 7, 9, 12; STOP conditions |

## Completion check

Before Plan 001 can be marked done, extract all story headings from the source
specification and all IDs from this matrix, sort both, and require an empty set
difference plus no duplicates. Every `Added` row must have an executable contract,
integration, route, accessibility, or end-to-end test at its target step. Every
intentional asymmetry must have a denied-path test proving the absent surface
cannot acquire the authority reserved for the other actor.
