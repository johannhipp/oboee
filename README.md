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

### Seeded frontend mode

To inspect realistic public and authenticated screens locally, run:

```bash
npm run dev:fixtures
```

Use `npm run seed:fixtures` when you only need to refresh the data without
leaving the fixture app running.

The fixture runner creates seven local Better Auth personas, seeds an idempotent
Convex graph with requests, skills, reviews, evidence, wallets, payouts,
settlements, recovery, migration, and operator records, and writes the route
IDs to the ignored `.dev/oboe-fixture.json` manifest. The fixture server uses
`http://localhost:3110` so it can run alongside the normal app.

Run the complete browser matrix—including anonymous boundaries and every
authenticated persona—with:

```bash
npm run test:e2e:seeded
```

Fixture writes are guarded by `OBOE_ENVIRONMENT=nonproduction` and
`OBOE_NONPRODUCTION_BOOTSTRAP_ENABLED=true`; the seed functions are internal
Convex functions and are not available to the browser.

## Commit messages

This project uses [Conventional Commits 1.0.0](COMMIT_CONVENTIONS.md). The
standard applies to human contributors and AI agents alike, so agents should
use it for every commit, including documentation-only changes.

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
