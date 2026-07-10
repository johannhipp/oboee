# Settlement and reconciliation runbook

## Invariants

- Final decisions create immutable integer obligations exactly once.
- Every unreleased work-escrow base unit maps to platform fee, author/reviewer
  payment, bond result, or deterministic largest-remainder backer refund.
- Transfer amount, token, network, sender, recipient snapshot, decision reference,
  and idempotency key are immutable.
- An obligation is `settled` only after the custody receipt matches every field,
  succeeds, and reaches configured confirmations.

## Lost or failed broadcast

1. Stop new broadcasts when duplicate risk exists; do not invent a transaction
   hash or mark success manually.
2. Query custody by `obligation:{obligationId}` or the recorded sender nonce.
3. If an exact receipt exists, let the internal reconciler verify it. If custody
   proves no transfer, retry the same immutable idempotency key.
4. Any contradictory amount/address/token/network/hash is an incident. Hold the
   obligation and cohort; preserve all provider responses outside application
   logs according to incident policy.

## Reconciliation

Compare source pools to obligations, obligations to transfer rows, and settled
obligations to confirmed receipts. Zero unexplained base units and zero duplicate
provider references are required. Operators may hold/release only pending/held
obligations after target-digest confirmation; they cannot edit amounts,
destinations, receipts, or decision references.
