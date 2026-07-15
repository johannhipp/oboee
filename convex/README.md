# Oboe Convex backend

The Convex directory owns marketplace state, authorization at the data boundary, and the trusted half of payment recording.

## Module map

- `schema.ts` defines the reachable MVP lifecycle and its indexes.
- `marketplace.ts` returns the bounded public request/skill projection. It never returns paid Markdown.
- `rfs.ts` owns request creation, claiming, submission, backer grants, and funding earnings.
- `skills.ts` owns resource-specific detail queries and server-derived available actions.
- `purchases.ts` owns entitlement checks, protected reads, and the private purchase write helper.
- `contributions.ts` owns the private contribution write helper.
- `paymentIngress.ts` is the only public payment-recording mutation. It accepts a short-lived HMAC-signed command produced after Next.js verifies MPP.
- `users.ts` owns the authenticated dashboard and future payout-wallet preference.
- `seeds.ts` exposes public seed metadata but keeps both fixture writers internal.
- `auth.ts`, `auth.config.ts`, and `http.ts` integrate Better Auth.
- `lib/` contains canonical validators, auth guards, lifecycle policy, wallet validation, earnings idempotency, and payment-command verification.
- `_generated/` is produced by Convex code generation and must not be edited manually.

## Trust surfaces

- Public queries return bounded metadata or auth-aware capability summaries.
- Authenticated mutations call the shared Convex auth guard and enforce domain ownership again.
- `paymentIngress.record` is public only as a transport surface; it verifies the command signature, expiry, principal consistency, exact amount/token, and global challenge replay before writing.
- Seed writers are `internalMutation` functions and are absent from `api.seeds`.
- Anonymous purchases return content only in the verified paid result. They do not create a reusable account grant.

Earnings are immutable accounting facts in `earningEntries`. There is no claim mutation, settlement status, fabricated receipt, or payout feature flag.

## Commands

From the repository root:

```bash
npx convex dev
npx convex codegen
npm test -- convex
npm run typecheck
```

Use `npx convex env set SITE_URL ...` and `npx convex env set OBOE_SERVER_COMMAND_SECRET ...` for the Convex runtime. Never commit deployment credentials or hand-edit generated bindings.
