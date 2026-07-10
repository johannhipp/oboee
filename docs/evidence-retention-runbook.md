# Evidence retention runbook

Restricted evidence is envelope-encrypted with a KMS-wrapped data key. Convex
stores ciphertext references and metadata only. Downloads are attachment-only,
ACL checked, hash verified after decryption, and access audited.

## Scanner/KMS failure

- Leave the artifact `pending`, `failed`, or quarantined and inaccessible.
- Do not set `clean` or `verified` from a client report.
- Record request/artifact IDs and provider status without keys, plaintext, direct
  storage URLs, raw manifests, or signatures.
- Retry through the trusted provider workflow. A reviewer may record independent
  verification only for an accepted assignment and cannot verify their own
  artifact.

## Expiry and legal hold

The lifecycle job deletes expired restricted ciphertext after the policy window.
Public metadata remains redacted. A security operator may place/release a legal
hold only after confirming the target digest and reason; the action is logged in
both evidence access and operator audit events. Review held artifacts regularly.

Alert on overdue undeleted artifacts, KMS/scan failures, denied-read spikes, or
missing storage objects. Preserve the deny-by-default state during incidents.
