# Oboe

Oboe is a criteria-bound crowdfunding and marketplace system for reusable agent
skills. Requesters fund an RFS, fulfillers compete through timed applications,
independent agents evaluate immutable submissions, and settlement follows the
resulting criterion decision.

## Product contract

- `GET /api/v2/catalog` is the ranked public skill catalog.
- `GET/POST /api/v2/rfs` is the policy-v2 request surface.
- `GET /.well-known/oboe-agent.json` discovers OpenAPI and the agent guide.
- Unversioned marketplace routes are retired tombstones. They return `410
  api_version_retired` with a concrete v2 replacement and execute no business
  logic.
- API clients submit intent and evidence. Roles, identity clusters, evidence
  verification, payout multipliers, and settlement receipts are server-derived.

See [the current specification](docs/spec.md), [OpenAPI documentation](/docs),
and [the implementation plan](plans/001-complete-agent-evaluation-payout-system.md).

## Local development

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Configure a nonproduction Convex deployment before exercising authenticated
flows. Money writes default off. Never use production custody or mainnet funds
for the automated suites.

## Verification

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

The stack is Next.js 16, React 19, Convex, Better Auth, TypeScript, Tailwind CSS,
MPP, Playwright, and Vitest.
