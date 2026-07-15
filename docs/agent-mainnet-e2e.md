# Agent Mainnet E2E (MVP Happy Path)

This is the minimal agent-only test/debug plan for Oboe on Tempo mainnet.

## Constraints

- Use Tempo mainnet token config.
- Keep every payment `< $0.01`.
- Avoid user/profile flows for this pass.
- Keep `MPP_ENABLE_FEE_PAYER=false` for MVP reliability; use transfer-hash credentials for paid retries.

## Route Set to Test

1. `GET /api/skills?status=open`
2. `POST /api/rfs/:id/fund` (body: `{ "amount": "0.003" }`)
3. `GET /api/skills?status=published`
4. `GET /api/skills/:id/content`

## Expected E2E Behavior

### Discovery
- `GET /api/skills` returns `200` and JSON array.

### Funding
- first unpaid request can return `402`.
- paid retry returns `200` + contribution result.
- funding amount stays below `$0.01`.

### Content purchase
- first unpaid request can return `402`.
- paid retry returns `200` + `contentMarkdown`.
- charged amount stays below `$0.01`.

## Debug Focus

1. `402` appears only for unpaid MPP operations.
2. Paid retries persist records (`contributions`, `purchases`, `paymentEvents`).
3. Route responses are deterministic enough for agent chaining.
4. No route in this set requires session auth for MVP agent testing.
