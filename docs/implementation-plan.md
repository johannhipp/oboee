# MVP implementation status

The marketplace MVP is implemented. This file records what remains before a production launch and prevents deferred policy-v2 ideas from silently becoming current scope.

## Implemented

- Convex marketplace schema and Better Auth integration
- public mixed catalog, text/status/tag filtering, and public detail
- authenticated create, claim, submit, profile, and payout-wallet flows
- Tempo Moderato MPP funding and content purchase
- exact-token and exact-amount verification
- challenge replay protection and account-bound CLI handoff
- backer/author/purchaser entitlement without public content leakage
- auto-publish after claimant submission
- creator/platform payout accounting, clearly separated from settlement
- unit, type, lint, build, browser, and independent paid-agent checks

## Before a real public launch

These are operational deployment requirements, not new product systems:

1. Choose and document production custody and payout operations.
2. Back up and migrate any existing policy-v2 data into a clean MVP deployment.
3. Rotate all test secrets and use production secret storage.
4. Decide whether and when to move from Moderato to mainnet; keep network selection fail-closed.
5. Add production monitoring for payment verification failures and Convex availability.
6. Establish basic support/contact and content takedown handling appropriate to the launch audience.

## Deferred product proposals

The following require separate discovery, scope, and acceptance criteria: automated payouts, disputes/refunds, reviewer workflows, moderation/evaluation, reputation/ranking, versioning, applications/bonds, API keys/delegation, recovery, and an operations console.

The archived policy-v2 audit remains useful as research for those proposals, but it is not a release checklist for this MVP.
