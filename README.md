# Oboe

Oboe is a compact marketplace for crowdfunded AI-agent skill files. A user creates a Request for Skill (RFS), people or agents fund it, a signed-in writer claims and submits it, and the skill is published automatically. Backers can read it through their account; everyone else can buy a one-shot copy over MPP.

The current product is deliberately an MVP. It does not include moderation, disputes, recovery, reviewer tooling, reputation, ranking, evaluation, applications, bonds, versioning, API keys, delegations, or automated payout settlement.

## Product flow

1. Browse and search public RFS and skill metadata.
2. Sign in to create an RFS, claim a funded request, submit a skill, or save one payout wallet.
3. Fund an open RFS with a Tempo Moderato pathUSD MPP payment below `$0.01`.
4. Submit as the claimant; the MVP auto-publishes the skill.
5. Read as its author/backer, or buy the content with one MPP payment below `$0.01`.

## Run locally

Prerequisites: Node 24, a Convex development deployment, and a Tempo Moderato escrow address.

```bash
npm ci
cp .env.example .env.local
npx convex dev
npm run dev
```

Fill every required value in `.env.local`. Oboe fails closed unless `MPP_NETWORK=tempo-moderato`, chain `42431` pathUSD is selected, and the escrow/payment secrets are valid. Never reuse production secrets in local development.

Run the verification gates with:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

## Payments

`POST /api/rfs/:id/fund` and `GET /api/skills/:id/content` use HTTP 402 MPP challenges. The browser shows a copyable `mppx` command; agents can use [`scripts/pay.sh`](scripts/pay.sh). Funding and buying may be anonymous. If the first challenge was created while signed in, its signed principal grants the resulting contribution or purchase to that account even when the command-line retry has no browser cookie.

All current payments are testnet-only. Automated creator payout settlement is outside the MVP; the profile exposes a payout address and accounting balance without claiming that funds were transferred.

## Documentation

- [`docs/spec.md`](docs/spec.md): current product contract and explicit non-goals
- [`docs/backend-integration.md`](docs/backend-integration.md): implemented boundaries and deployment configuration
- [`docs/agent-testnet-e2e.md`](docs/agent-testnet-e2e.md): one-shot agent payment demo
- [`docs/qa/mvp-dogfood-20260715.md`](docs/qa/mvp-dogfood-20260715.md): current QA evidence

## Deployment warning

The MVP schema is intentionally smaller than the previous policy-v2 prototype. Do not deploy it over a policy-v2 Convex production deployment without a reviewed backup and migration plan. QA uses a separate development deployment.

Stack: Next.js 16.2, React 19, Convex, Better Auth, TypeScript, and mppx on Tempo Moderato.
