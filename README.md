# Oboe

Oboe is a small marketplace for crowdfunded, agent-readable skill files. People and agents fund a Request for Skill (RFS), a signed-in researcher claims it, and the submitted Markdown becomes a published paid skill.

The current product is a Tempo Moderato MVP. It includes public discovery, Better Auth accounts, MPP funding and purchases, account entitlements, immutable testnet earnings accounting, and a future payout-wallet preference. It does not execute creator payouts, accept mainnet funds, or implement moderation, disputes, recovery, reputation, delegated budgets, or review workflows.

## Local setup

Prerequisites:

- Node.js 24 and npm
- a Convex development deployment
- a Tempo Moderato escrow address
- a funded testnet account only when manually running paid smoke tests

Install and configure the application:

```bash
npm ci
cp .env.example .env.local
npx convex dev
npm run dev
```

`.env.example` separates the required settings by purpose:

- site and Convex URLs for Better Auth
- MPP network, recipient, pathUSD, and verifier secrets for Next.js
- `SITE_URL` and `OBOE_SERVER_COMMAND_SECRET` in the Convex environment
- optional fee sponsorship and guarded CLI settings

Set Convex values with `npx convex env set NAME value`; do not put real secrets in committed files. Payment configuration is lazy so public metadata can render without it, but every paid route fails closed when a trusted setting is missing or invalid.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
bash -n scripts/pay.sh
./scripts/pay.sh --help
```

Unit and browser tests do not move funds. The manual smoke plan in [`docs/agent-testnet-e2e.md`](docs/agent-testnet-e2e.md) does; review the network, token, recipient, account, and amount before authorizing it.

## Product flow

1. Browse the bounded mixed marketplace of open/funded requests and published skill metadata.
2. Sign in to create, claim, submit, or save a future payout destination.
3. Fund an open request with `1..9000` Tempo Moderato pathUSD base units.
4. The assigned claimant submits Markdown and the request publishes atomically.
5. Authors and eligible account backers read persistently; other callers can purchase a one-shot copy through MPP.

The profile reports **unsettled testnet earnings** from one immutable accounting table. It never claims those entries were transferred or are currently claimable on-chain.

## Documentation

- [`docs/spec.md`](docs/spec.md): authoritative MVP product and domain contract
- [`src/lib/api/contract.ts`](src/lib/api/contract.ts): executable HTTP route manifest
- [`public/SKILL.md`](public/SKILL.md): concise agent procedure
- [`docs/agent-testnet-e2e.md`](docs/agent-testnet-e2e.md): guarded manual Moderato smoke plan
- [`convex/README.md`](convex/README.md): backend module and trust-boundary map
- [`docs/qa/mvp-dogfood-20260715.md`](docs/qa/mvp-dogfood-20260715.md): current UI QA evidence
