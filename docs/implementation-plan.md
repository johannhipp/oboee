# Oboe Backend + Agent-Facing Implementation Plan

This plan covers API, auth, data, and MPP payment flows only. It excludes frontend UI implementation.

## 1) Scope and outcomes

### In scope

- Convex backend and schema
- BetterAuth + Convex integration
- Human + agent JSON APIs
- MPP-gated fund and content-purchase flows
- Access control and payout accounting
- Test strategy for 401/402/payment retry behavior

### Out of scope

- Frontend page buildout
- Refund/dispute workflows
- Reputation/versioning systems
- Mainnet deployment

## 2) Locked architecture

- Runtime: Next.js 16 App Router + Convex
- Auth: BetterAuth via `@convex-dev/better-auth`
- Payments: `mppx` charge intent (v1) on Tempo testnet
- Funding custody: platform escrow wallet
- Payout split: 99% researcher / 1% platform fee
- Claim model: open bounty, first atomic claim wins
- Content entitlement: existing `AccessGrant` bypasses payment
- Purchase revenue split: 99% researcher / 1% platform fee

## 3) Data model implementation (Convex)

Create `convex/schema.ts` with these tables and indexes.

### `users`

- Fields: `email`, `name`, `walletAddress`, timestamps
- Indexes: `by_email`, `by_walletAddress`
- Notes: wallet link is optional at signup but required for payout claim

### `rfs`

- Fields:
  - `authorUserId`
  - `claimantUserId` (nullable)
  - `title`, `description`, `scope`
  - `fundingThresholdBaseUnits`
  - `minimumContributionBaseUnits`
  - `currentAmountBaseUnits`
  - `fundingTokenAddress`
  - `status` (`open` | `funded` | `fulfilled` | `published` | `cancelled`)
  - timestamps
- Indexes: `by_status`, `by_author`, `by_claimant`

### `contributions`

- Fields:
  - `rfsId`, `backerUserId`
  - `amountBaseUnits`, `currencyAddress`
  - `challengeId`, `receiptReference`
  - `status` (`accepted` | `rejected`)
  - timestamps
- Indexes: `by_rfs`, `by_backer`, `by_challengeId` (unique behavior in code)

### `skills`

- Fields:
  - `rfsId`, `authorUserId`
  - `contentMarkdown`, `summary`
  - `tags`
  - `purchasePriceBaseUnits`
  - `status` (`draft` | `submitted` | `published`)
  - timestamps
- Indexes: `by_rfs` (enforce one-to-one in code), `by_status`

### `purchases`

- Fields:
  - `skillId`, `buyerUserId`
  - `amountBaseUnits`, `currencyAddress`
  - `challengeId`, `receiptReference`
  - timestamps
- Indexes: `by_skill`, `by_buyer`, `by_challengeId`

### `accessGrants`

- Fields: `userId`, `skillId`, `source` (`backer_unlock` | `purchase` | `admin`), timestamps
- Indexes: `by_user_skill` (enforced unique in code), `by_skill`

### `payoutLedger`

- Fields:
  - `rfsId`, `researcherUserId`
  - `grossAmountBaseUnits`
  - `platformFeeBaseUnits`
  - `netAmountBaseUnits`
  - `status` (`locked` | `claimable` | `claimed`)
  - `receiptReference` (for claim transfer)
  - timestamps
- Indexes: `by_rfs`, `by_researcher`, `by_status`

### `payoutEntries`

- Fields:
  - `rfsId`, `researcherUserId`
  - `source` (`funding` | `purchase`)
  - `grossAmountBaseUnits`, `platformFeeBaseUnits`, `netAmountBaseUnits`
  - `status` (`claimable` | `claimed`)
  - `claimGroupId` (nullable)
  - timestamps
- Indexes: `by_researcher_status`, `by_rfs`, `by_claimGroup`

### `paymentEvents`

- Fields:
  - `type` (`fund` | `buy` | `payout_claim`)
  - `resourceId`
  - `challengeId`, `receiptReference`
  - `amountBaseUnits`, `currencyAddress`
  - `status`
  - timestamps
- Indexes: `by_challengeId`, `by_type_resource`

## 4) Auth integration plan (BetterAuth + Convex)

## 4.1 Install and version pin

- Add deps:
  - `convex@latest`
  - `@convex-dev/better-auth`
  - `better-auth@1.5.3` pinned exactly

## 4.2 Convex auth wiring

- Add:
  - `convex/convex.config.ts`
  - `convex/auth.config.ts`
  - `convex/auth.ts`
  - `convex/http.ts`
- Register BetterAuth routes in Convex HTTP router.

## 4.3 Next auth proxy + client

- Add:
  - `src/lib/auth-server.ts`
  - `src/lib/auth-client.ts`
  - `src/app/api/auth/[...all]/route.ts`
- Rule: server-side BetterAuth API operations run inside Convex functions.

## 4.4 Env setup

- Convex env: `BETTER_AUTH_SECRET`, `SITE_URL`
- Next env:
  - `NEXT_PUBLIC_CONVEX_URL`
  - `NEXT_PUBLIC_CONVEX_SITE_URL`
  - `NEXT_PUBLIC_SITE_URL`
  - `MPP_SECRET_KEY`
  - `MPP_RECIPIENT_ESCROW_ADDRESS`
  - `MPP_FUNDING_TOKEN_ADDRESS`

## 4.5 Wallet linking endpoint

- `POST /api/me/wallet`
  - authenticated
  - validates chain address format
  - stores `walletAddress` on user profile

## 5) API implementation plan

Each endpoint returns deterministic JSON for agent use.

### 5.1 Catalog and detail

- `GET /api/skills`
  - filters: `status`, `q`, `authorId`, `tags`
  - returns mixed list of open/funded RFS and published skills
- `GET /api/skills/[id]`
  - returns full object + computed flags:
  - `canFund`, `canClaim`, `canBuy`, `hasAccess`

### 5.2 RFS lifecycle

- `POST /api/rfs`
  - authenticated
  - validates threshold/minimum/title/scope
  - creates `rfs` row in `open`
- `GET /api/rfs/[id]`
  - returns status + funding progress + claimant
- `POST /api/rfs/[id]/claim`
  - authenticated
  - only allowed when `status=funded` and `claimantUserId` is null
  - atomic compare-and-set to first claimant
- `POST /api/rfs/[id]/submit`
  - only claimant can submit
  - creates/updates skill content
  - transitions `funded -> fulfilled -> published` in v1
  - creates funding-based payout rows as claimable

### 5.3 MPP fund flow

- `POST /api/rfs/[id]/fund`
  - auth first (`401` before `402`)
  - caller provides amount
  - validates:
    - rfs exists and status is `open`
    - amount >= minimumContributionBaseUnits
  - payment handling:
    - no credential: return `402` challenge with requested amount
    - credential retry: verify and persist payment
    - verify `currencyAddress === rfs.fundingTokenAddress`
  - atomic post-payment update:
    - append contribution
    - increment `currentAmountBaseUnits`
    - if threshold crossed: transition `open -> funded`
  - idempotency: reject replayed `challengeId`

### 5.4 MPP content purchase flow

- `GET /api/skills/[id]/content`
  - auth required
  - if existing `AccessGrant`: return markdown content
  - else issue/verify MPP challenge for `purchasePriceBaseUnits`
  - on paid retry:
    - append purchase
    - create `AccessGrant` with source `purchase`
    - create purchase-based payout row with 99/1 split
    - return markdown content + receipt reference

### 5.5 Payout claim

- `POST /api/rfs/[id]/payout/claim`
  - only claimant/researcher user with linked payout wallet
  - claims selected payout rows where `status=claimable`
  - idempotency key required (`claimGroupId`) to prevent duplicate claims
  - creates payment transfer event (or records external transfer in v1)
  - marks claimed payout rows `claimed`

## 6) Agent-facing response contracts

Standard response envelope for all write endpoints:

- `status`: `ok` | `error`
- `resourceType`: `rfs` | `skill` | `contribution` | `purchase` | `payout`
- `resourceId`
- `nextState` (if lifecycle changed)
- `accessGranted` (boolean, where relevant)
- `receiptReference` (when payment succeeded)

Payment-required responses:

- HTTP `402`
- `WWW-Authenticate: Payment ...`
- JSON body includes machine-readable error code + retriable hint

Authentication-required responses:

- HTTP `401`
- never emit `402` for unauthenticated calls

## 7) Business rules and calculations

### 7.1 Funding transitions

- After each accepted contribution:
  - `currentAmountBaseUnits += amount`
  - if current >= threshold and status `open`, set `funded`

### 7.2 Backer unlock

- On publish (same atomic mutation as publish transition):
  - query all contributions for that RFS where amount >= minimum
  - create `AccessGrant` rows with source `backer_unlock`

### 7.3 Payout split

- `gross = total accepted contributions`
- `platformFee = floor(gross * 0.01)`
- `net = gross - platformFee`

Apply the same split to each non-backer purchase.

## 8) Security, integrity, and idempotency

- Persist consumed `challengeId` for `fund` and paid `content` calls
- Enforce single claimant with atomic mutation
- Validate all amount inputs as integer base units
- Do not trust client entitlement flags; always resolve from DB
- Store all receipt references for auditability
- Make payout claims idempotent with `claimGroupId`

## 9) Testing plan (backend + agent-facing)

## 9.1 Unit tests (Convex function level)

- RFS state transitions
- payout split math
- eligibility checks (`canClaim`, `canBuy`, `hasAccess`)

## 9.2 Integration tests

- auth + API route behavior
- `401 -> 402 -> 200` flow correctness
- replay protection on duplicate challenge IDs
- payout claim idempotency on retry

## 9.3 Payment flow tests with `mppx`

- `npx mppx --inspect <endpoint>` for challenge inspection
- funded account performs real testnet paid calls
- verify contribution/purchase rows and receipt references

## 9.4 Concurrency tests

- simultaneous `claim` race (only first wins)
- simultaneous `fund` writes around threshold crossing
- publish + backer unlock consistency under retries

## 10) Delivery phases

### Phase 0: Foundation

- Install Convex + BetterAuth integration
- Add env + secrets management
- Replace PoC `/api/bid` usage with shared payment service module

### Phase 1: Core data + auth

- Implement Convex schema + generated types
- Implement authenticated user resolver and wallet profile fields

### Phase 2: RFS lifecycle APIs

- Build `POST /api/rfs`, `GET /api/rfs/[id]`, `POST /api/rfs/[id]/claim`, `POST /api/rfs/[id]/submit`

### Phase 3: Funding payments

- Build `POST /api/rfs/[id]/fund` with MPP challenge/retry flow
- Add threshold transition logic and payment event logging

### Phase 4: Purchase and access

- Build MPP-gated `GET /api/skills/[id]/content`
- Add access grant generation for backers and buyers

### Phase 5: Payout and hardening

- Build `POST /api/rfs/[id]/payout/claim`
- Add replay protection, race-safe mutations, and audit logging

### Phase 6: Verification

- Run lint/build/type checks
- Run integration + payment flow tests
- Validate all response contracts for agent orchestration

## 11) Mainnet migration checklist (later)

- Replace funding token address with mainnet USDC
- Replace escrow recipient with production wallet
- Enable fee payer strategy if needed
- Run smoke tests against mainnet wallet before launch
