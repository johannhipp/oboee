# Oboe

## The pitch

Agents are bad at security. They optimize for "it compiles" and move on. Generic skill files help, but a 200-line markdown about "auth best practices" won't teach an agent how to harden a GraphQL subscription layer against batching attacks. That knowledge lives in the heads of security researchers who have no reason to write it up for free.

Oboe is a crowdfunded skills marketplace. Anyone can file a **Request for Skill (RFS)** describing expertise they need. Others chip in until the funding threshold is met. A researcher fulfills the RFS, delivers the skill, and gets paid. Backers get access. Everyone else buys it later for a fraction of a cent.

## Core concept: Request for Skill (RFS)

The RFS is the atomic unit of Oboe. Everything on the platform is either an open RFS collecting funds, or a published skill that started as one.

Anyone can write an RFS. You don't need to be a "researcher" -- there are no role distinctions in the UI. The person who files an RFS might be the same person who fulfills a different one. Today you need a skill, tomorrow you write one. The platform doesn't care.

An RFS has four states:

| Status | What's happening |
|---|---|
| `open` | Accepting funds. Anyone can chip in. |
| `funded` | Threshold met. Waiting for someone to claim and fulfill it. |
| `fulfilled` | Skill delivered, under review. |
| `published` | Live. Backers have access. Everyone else can buy it. |

## How people use it

You sign up once (BetterAuth). From there you can do any combination of:

- **Write an RFS** -- describe what you need, set a funding goal.
- **Back an RFS** -- put money toward someone else's request.
- **Claim a funded RFS** -- commit to writing the skill.
- **Browse and buy** -- find published skills, pay sub-$0.01 per download.

There's one unified feed. Published skills and open RFSs live side by side, filterable by status. No separate "researcher dashboard" or "buyer portal."

## How agents use it

Agents hit the same data through JSON endpoints. The catalog is identical to what humans see in the browser.

**Discover**: `GET /api/skills` returns the full catalog -- published skills and open RFSs in one list. Filter by status, tags, or keyword. An agent looking for "Next.js middleware hardening" gets back both a published skill it can buy now and an open RFS it could back.

**Buy**: `GET /api/skills/[id]/content` is gated by MPP. Agent sends request, gets a 402 challenge, signs a sub-$0.01 payment, retries, gets the skill file. No API keys. No account creation. Just HTTP and a wallet.

**Back**: `POST /api/rfs/[id]/fund` lets an agent chip in toward an open RFS. Same MPP flow, higher amount.

**Check status**: `GET /api/rfs/[id]` returns the current state of any RFS. An agent that backed a request can poll this to know when the skill is ready.

The point: agents shouldn't need a different protocol than humans. Same data, same payment flow, different rendering.

## Access rules

- **Backers** (contributed >= minimum amount to the RFS): access the skill at no extra cost once published.
- **Everyone else**: buy any published skill for sub-$0.01 via MPP micropayment.
- **Browsing is free**. Metadata, descriptions, and status are public. Only the skill file content is gated.

## What a "deep skill" actually looks like

A generic skill says "validate user input." A deep skill from Oboe walks an agent through:

- Which validation library to use for this specific framework version, and why the obvious choice is wrong.
- What the actual attack surface looks like, with concrete exploit examples.
- Where the framework's own defenses fall short.
- Code patterns the agent should generate, and patterns it should refuse to generate.
- How to verify the fix works -- not "write tests" but specific assertions against specific attack vectors.

The researcher's domain expertise is the product. The skill file is the delivery format.

---

## Technical details

### Payment rails

All payments go through the Machine Payments Protocol (MPP). MPP uses HTTP 402 challenges with Tempo stablecoins (pathUSD/USDC). The `mppx` SDK handles challenge, sign, verify on both server and client. Agents and humans pay the same way: HTTP request, 402 response, signed payment, retry. No API keys, no subscriptions.

Sub-cent transactions are the whole reason MPP exists. Stripe takes $0.30 minimum per transaction -- that kills any model where a skill costs $0.005. MPP on Tempo settles in milliseconds for near-zero fees.

### Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Auth | BetterAuth |
| Payments | mppx 0.4.7 (Tempo stablecoins) |
| Frontend | React 19, Tailwind CSS 4 |
| Language | TypeScript 5 |

### Data model

**User** -- signs up via BetterAuth. Has a wallet address. Can file RFSs, back RFSs, claim funded RFSs, and buy published skills. No role column -- behavior determines what you are.

**RFS** -- title, description, scope, funding threshold, current amount, status (`open` | `funded` | `fulfilled` | `published`), author (user who filed it), claimant (user who claimed it, nullable).

**RFS tags** -- short keyword tags used for catalog filtering (`auth`, `nextjs`, `graphql`, etc).

**Contribution** -- links a user to an RFS with an amount. Tracked to determine backer access.

**Skill** -- the delivered content. Linked 1:1 to a fulfilled/published RFS. Markdown body, metadata.

**Skill tags** -- inherited from RFS and optionally extended on submit.

**Purchase** -- a sub-$0.01 MPP transaction from a non-backer to access a published skill.

### Routes

```
Pages
/                           Landing
/browse                     Unified feed (published skills + open RFSs)
/browse/[id]                RFS detail -- fund, claim, or buy depending on status
/new                        Write a new RFS
/me                         Your RFSs, contributions, purchased skills

API (human + agent)
/api/auth/*                 BetterAuth
/api/skills                 GET: catalog (filterable by status, search)
/api/skills/[id]            GET: RFS/skill detail
/api/skills/[id]/content    GET: skill file (MPP-gated, sub-$0.01)
/api/rfs                    POST: create new RFS
/api/rfs/[id]               GET: RFS status + funding progress
/api/rfs/[id]/fund          POST: contribute toward threshold (MPP-gated)
/api/rfs/[id]/claim         POST: researcher claims a funded RFS
/api/rfs/[id]/submit        POST: claimant submits skill content
/api/rfs/[id]/payout/claim  POST: claimant claims payout after publish
/api/me/wallet              POST: link or update payout wallet
```

### Non-goals (hackathon scope)

- Dispute resolution or refunds.
- Reputation or rating system.
- Skill versioning.
- Mobile-optimized UI.
- Mainnet deployment (testnet for now, mainnet later).

## Locked backend decisions (v1)

These are explicit implementation decisions for backend and agent-facing APIs.

1. **Database + backend runtime**: Convex.
2. **Auth**: BetterAuth via `@convex-dev/better-auth` (Convex component integration).
3. **Funding custody**: all `/fund` payments go to a platform escrow wallet first.
4. **Payout timing**: researcher payout is claimable only after publish approval.
5. **Review workflow**: auto-publish on researcher submit in v1, but payout still requires publish state.
6. **Backer unlock rule**: backers unlock free access if they contributed at least the minimum contribution.
7. **Minimum contribution**: no practical minimum beyond positive payment; enforce `>= 1` base unit.
8. **Purchase pricing**: researcher sets fixed per-skill `purchasePriceBaseUnits` for non-backers.
9. **MPP strategy**:
- `/api/rfs/[id]/fund`: one-time `charge` intent in v1.
- `/api/skills/[id]/content`: one-time `charge` intent for non-entitled callers.
- session-based MPP is deferred to post-hackathon.
10. **Agent protocol contract**: authenticated endpoints return `401` before `402`; payment challenges only for authenticated callers.
11. **Payout fee model**: payout is `99%` to researcher, `1%` platform fee.
12. **Content entitlement**: if caller already has `AccessGrant`, return content without requiring another payment.
13. **Funding amount input**: `/fund` uses caller-provided amount per request (validated server-side).
14. **Claim model**: open bounty claim; any authenticated user can claim a funded RFS and first atomic claim wins.
15. **Purchase revenue model**: non-backer purchases also split `99%` researcher / `1%` platform fee.
16. **Wallet lifecycle**: users can sign up without a wallet; payout claim requires a linked payout wallet address.

## Backend domain model refinement

### Additional entities

- **AccessGrant**
  - `userId`, `skillId`, `source` (`backer_unlock` | `purchase` | `admin`), timestamps
- **PayoutLedger**
  - `rfsId`, `researcherUserId`, `grossAmountBaseUnits`, `platformFeeBaseUnits`, `netAmountBaseUnits`, `status` (`locked` | `claimable` | `claimed`), `receiptReference`, timestamps
- **PaymentEvent**
  - normalized payment audit row for contributions/purchases/payout claims:
  - `type`, `resourceId`, `challengeId`, `receiptReference`, `amountBaseUnits`, `currencyAddress`, `status`, timestamps

### RFS state machine refinement

- `open` -> `funded` when `currentAmount >= threshold`
- `funded` -> `fulfilled` when claimant submits skill content
- `fulfilled` -> `published` immediately in v1 (auto-publish)
- `published` is terminal in v1
- `cancelled` reserved for admin/manual cancellation

### Invariants

1. Contribution records are append-only.
2. `currentAmount` equals accepted contribution sum.
3. An RFS can have at most one published skill.
4. A user can access skill content only with an `AccessGrant`.
5. A `challengeId` is single-use (replay-protected).
6. Payout claim requires ledger row in `claimable` state.
7. Payout claim is idempotent and can only succeed once per claimable balance version.

## API contract refinement (backend + agent-facing)

### Existing/kept routes

- `GET /api/skills`
- `GET /api/skills/[id]`
- `GET /api/skills/[id]/content`
- `POST /api/rfs`
- `GET /api/rfs/[id]`
- `POST /api/rfs/[id]/fund`
- `POST /api/rfs/[id]/claim`

### Additional backend routes required for v1

- `POST /api/rfs/[id]/submit`
  - claimant submits skill content and metadata
  - transitions RFS to `fulfilled` then `published`
- `POST /api/rfs/[id]/payout/claim`
  - researcher claims payout after publish
  - records payout receipt and marks payout ledger as `claimed`
- `POST /api/me/wallet`
  - user links or updates payout wallet address

### MPP endpoint behavior

For `/fund` and paid `/content` flows:

1. Validate auth first (`401` if unauthenticated).
2. If payment is required and missing, return `402` challenge.
3. On credential retry, verify payment and apply state change atomically.
4. Persist `challengeId` + receipt reference to prevent replay.
5. Return deterministic JSON for agents: `status`, `resourceId`, `accessGranted`, `nextState`.
6. Validate payment currency matches expected token address.

## Convex + BetterAuth implementation constraints

1. Use `convex >= 1.25.0`.
2. Pin `better-auth` to the version required by `@convex-dev/better-auth` (currently `1.5.3`).
3. Register BetterAuth routes in Convex HTTP router; Next auth route is only a proxy.
4. Run BetterAuth server API operations inside Convex functions, not arbitrary Next server code.

## Deferred (post-hackathon)

- Session intent for recurring funding/purchase channels.
- Mainnet settlement.
- Moderation scoring/review queues.
- Refund/dispute workflows.
