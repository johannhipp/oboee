# Backend integration

Status: policy-v2 implementation reference. The original mock/first-claim guide
is superseded and must not be used.

## Boundaries

- Next.js owns HTTP authentication negotiation, Zod parsing, idempotency
  envelopes, CSRF origin checks, payment/KMS transport, safe DTO serialization,
  OpenAPI, and retired-route tombstones.
- Convex owns principal derivation, authorization, contracts, state machines,
  exact integer money, evidence metadata, decisions, obligations, reputation,
  audit, and scheduled reconciliation.
- Better Auth owns user/session/passkey/API-key records. Oboe maps every accepted
  credential to the same stable principal and records narrower delegations.
- MPP verifies payment challenges. Only a signed server envelope may invoke the
  Convex receipt-ingestion boundary.
- KMS returns wrapped data keys; plaintext restricted evidence is never stored in
  Convex. The configured scanner receives a controlled ciphertext/envelope job,
  owns MIME/malware clearance, and cannot decide reproducibility or payout.
  Custody owns transfer broadcast and receipt lookup.

## API implementation

All business routes are under `/api/v2` and are inventoried bidirectionally by
`src/lib/api-v2/openapi-routes.test.ts`. Runtime schemas live under
`src/lib/api-v2/schemas`. Public pages use the same explicit projection builders
as API handlers in `src/lib/read-models/public.ts`.

Every external command:

1. resolves a cookie session or `x-api-key` to a principal;
2. enforces same-origin for cookie writes;
3. parses the request through Zod;
4. atomically applies principal/action rate limits;
5. reserves `Idempotency-Key` against a canonical request digest;
6. invokes a principal-aware Convex mutation;
7. stores the stable result for exact replay and appends principal activity.

Privileged human commands additionally reject API keys, require a recent
passkey, active role, current target digest, and reason, then append
`operatorAuditEvents`.

## Local integration

Copy `.env.example`, configure a nonproduction Convex deployment, run
`npx convex codegen`, then `npm run dev`. Keep `OBOE_MONEY_WRITES_ENABLED=false`
until fake-provider integration tests pass. Do not point automated tests at
mainnet or production custody.

`OBOE_SCANNER_URL` must accept the exact artifact envelope and return
`malwareDetected`, `contentTypeMatches`, and an opaque `reportReference`.
Failures remain inaccessible and appear in `/ops`; they never fail open.

## Verification

`npm test` covers pure policy and Convex migrations; route tests cover API
retirement, OpenAPI inventory, DTO privacy, payment gates, and idempotency
boundaries. `npm run test:e2e` boots the app without production credentials and
checks public rendering, accessibility, CSP, discovery, v1 isolation, and
privileged unauthenticated states on desktop and mobile. Provider-backed flows
follow `docs/nonproduction-e2e.md`.
