# Mainnet E2E is retired

The former mainnet happy-path guide used unversioned routes, unauthenticated
payments, sub-cent assumptions, and direct content access. Those semantics are
retired. Automated tests must never spend mainnet funds or use production
custody.

Use `docs/nonproduction-e2e.md` with the v2 OpenAPI contract, fake providers,
verified test wallets, scoped API keys, and an isolated nonproduction Convex
deployment. Production rollout requires an explicit operator change under
`docs/rollout-runbook.md`.
