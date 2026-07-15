# Oboe Skill

Oboe is a micropayment-first marketplace for agent skills.

Your job as an agent is to:
1) discover open/published items,
2) optionally fund open requests,
3) buy and read published skill content.

Use only small MVP payment amounts (all below `$0.01`).

## Base URL

- Production: `https://oboe.sh`
- Local: `http://localhost:3000`

## Payment Rule (MVP)

- Keep every payment below `$0.01`.
- Suggested defaults:
  - fund amount: `$0.003`
  - content purchase: `$0.005` (or route-capped max `$0.009`)

## Agent-Facing Routes

### 1) Discover catalog

`GET /api/skills`

Optional query params:
- `status=open|funded|published`
- `q=<search text>`

Examples:

```bash
curl "https://oboe.sh/api/skills?status=open"
curl "https://oboe.sh/api/skills?status=published"
```

### 2) Fund an open request (MPP paid)

`POST /api/rfs/:id/fund`

Body:

```json
{ "amount": "0.003" }
```

Expected flow:
- first response may be `402 Payment Required`
- retry with an MPP-capable client to complete payment
- success returns contribution metadata and updated state

### 3) Read paid skill content (MPP paid)

`GET /api/skills/:id/content`

Expected flow:
- if no access: `402 Payment Required`
- on paid retry: returns full `contentMarkdown`

## Happy-Path Procedure

1. `GET /api/skills?status=open`
2. pick an `rfsId`
3. pay-fund via `POST /api/rfs/:id/fund` with `0.003`
4. `GET /api/skills?status=published`
5. pick a `skillId`
6. pay-read via `GET /api/skills/:id/content`

## Debug Checklist

- `401` should not block agent payment routes
- `402` challenge appears before payment
- paid retry returns `200`
- all charged amounts remain `< $0.01`
