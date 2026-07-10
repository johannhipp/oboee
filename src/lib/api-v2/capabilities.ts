import type { Capability } from "./schemas/common";

export const capability = (
  action: string,
  method: Capability["method"],
  href: string,
  options: Partial<Omit<Capability, "action" | "method" | "href">> = {},
): Capability => ({
  action,
  method,
  href,
  allowed: options.allowed ?? true,
  idempotencyRequired: options.idempotencyRequired ?? method !== "GET",
  humanOnly: options.humanOnly ?? false,
  ...options,
});

export const rfsCapabilities = (id: string, status?: string): Capability[] => [
  capability("read", "GET", `/api/v2/rfs/${id}`, { idempotencyRequired: false }),
  capability("fund", "POST", `/api/v2/rfs/${id}/funding-intents`, { requiredPermission: "fund", allowed: status === "open", denialCode: status === "open" ? undefined : "invalid_state" }),
  capability("check_application_eligibility", "GET", `/api/v2/rfs/${id}/applications/eligibility`, { requiredPermission: "apply", idempotencyRequired: false, allowed: status === "funded" }),
  capability("apply", "POST", `/api/v2/rfs/${id}/applications`, { requiredPermission: "apply", allowed: status === "funded" }),
  capability("submit", "POST", `/api/v2/rfs/${id}/submissions`, { requiredPermission: "submit", allowed: status === "assigned" || status === "revision_requested" }),
  capability("evaluate", "POST", `/api/v2/rfs/${id}/evaluations`, { requiredPermission: "evaluate", allowed: status === "evaluation_open" || status === "disputed" }),
  capability("settlement", "GET", `/api/v2/rfs/${id}/settlement`, { requiredPermission: "settlement:read", idempotencyRequired: false }),
];

export const skillCapabilities = (id: string, versionId?: string, available = true): Capability[] => [
  capability("read", "GET", `/api/v2/skills/${id}`, { idempotencyRequired: false }),
  capability("purchase", "POST", `/api/v2/skills/${id}/purchase-intents`, { requiredPermission: "purchase", allowed: available && Boolean(versionId), precondition: "verified_wallet" }),
  capability("read_content", "GET", `/api/v2/skills/${id}/versions/${versionId ?? "{versionId}"}/content`, { requiredPermission: "skills:read", idempotencyRequired: false, allowed: available && Boolean(versionId) }),
  capability("review", "POST", `/api/v2/skills/${id}/reviews`, { requiredPermission: "evaluate", allowed: available && Boolean(versionId), precondition: "redeemed_exact_version_grant" }),
];

export const reviewAssignmentCapabilities = (id: string, state: string): Capability[] => [
  capability("read", "GET", `/api/v2/review-assignments/${id}`, { idempotencyRequired: false }),
  capability("accept", "POST", `/api/v2/review-assignments/${id}/accept`, { allowed: state === "open", humanOnly: true, denialCode: state === "open" ? undefined : "invalid_state" }),
  capability("decline_conflict", "POST", `/api/v2/review-assignments/${id}/decline`, { allowed: state === "open", humanOnly: true, denialCode: state === "open" ? undefined : "invalid_state" }),
  capability("complete", "POST", `/api/v2/review-assignments/${id}/complete`, { allowed: state === "accepted", humanOnly: true, denialCode: state === "accepted" ? undefined : "invalid_state" }),
];

export const humanActionCapabilities = (id: string, status: string): Capability[] => [
  capability("read", "GET", `/api/v2/me/human-actions/${id}`, { idempotencyRequired: false }),
  capability("approve", "POST", `/api/v2/me/human-actions/${id}/approve`, { allowed: status === "pending", humanOnly: true, precondition: "recent_passkey", denialCode: status === "pending" ? undefined : "invalid_state" }),
  capability("decline", "POST", `/api/v2/me/human-actions/${id}/decline`, { allowed: status === "pending", humanOnly: true, precondition: "recent_passkey", denialCode: status === "pending" ? undefined : "invalid_state" }),
];

export const operationCapabilities = (id: string): Capability[] => [
  capability("poll", "GET", `/api/v2/operations/${id}`, { idempotencyRequired: false }),
];

export const applicationCapabilities = (rfsId: string, id: string, state: string, resourceVersion?: number, editable = true): Capability[] => [
  capability("read_applications", "GET", `/api/v2/rfs/${rfsId}/applications`, { idempotencyRequired: false }),
  capability("revise", "POST", `/api/v2/rfs/${rfsId}/applications/${id}/revisions`, { requiredPermission: "apply", allowed: editable && state === "active", resourceVersion, precondition: "If-Match" }),
  capability("withdraw", "POST", `/api/v2/rfs/${rfsId}/applications/${id}/withdraw`, { requiredPermission: "apply", allowed: editable && state === "active", resourceVersion, precondition: "If-Match" }),
  capability("endorse", "POST", `/api/v2/rfs/${rfsId}/applications/${id}/endorse`, { requiredPermission: "fund", allowed: state === "active" }),
  capability("fund_bond", "POST", `/api/v2/rfs/${rfsId}/bond-intents`, { requiredPermission: "apply", allowed: editable && state === "selected", precondition: "verified_wallet_and_required_bond" }),
];

export const assignmentCapabilities = (rfsId: string, applicationId?: string, state?: string, bondRequired = false): Capability[] => [
  capability("read_assignment", "GET", `/api/v2/rfs/${rfsId}/assignment`, { idempotencyRequired: false }),
  capability("fund_bond", "POST", `/api/v2/rfs/${rfsId}/bond-intents`, { requiredPermission: "apply", allowed: Boolean(applicationId && bondRequired && state === "selected"), precondition: "verified_wallet" }),
  capability("submit", "POST", `/api/v2/rfs/${rfsId}/submissions`, { requiredPermission: "submit", allowed: state === "selected" }),
];

export const evaluationCapabilities = (rfsId: string, id: string, active: boolean): Capability[] => [
  capability("read_evaluations", "GET", `/api/v2/rfs/${rfsId}/evaluations`, { idempotencyRequired: false }),
  capability("supersede", "POST", `/api/v2/rfs/${rfsId}/evaluations/${id}/supersede`, { requiredPermission: "evaluate", allowed: active }),
];

export const disputeCapabilities = (rfsId: string, id: string, state: string): Capability[] => [
  capability("read_disputes", "GET", `/api/v2/rfs/${rfsId}/disputes`, { idempotencyRequired: false }),
  capability("append_evidence", "POST", `/api/v2/rfs/${rfsId}/disputes/${id}/evidence`, { requiredPermission: "evaluate", allowed: state !== "resolved", precondition: "clean_verified_evidence" }),
];

export const evidenceCapabilities = (rfsId: string, id: string, downloadable: boolean): Capability[] => [
  capability("read_evidence", "GET", `/api/v2/rfs/${rfsId}/evidence`, { idempotencyRequired: false }),
  capability("download", "GET", `/api/v2/evidence/${id}/download`, { requiredPermission: "evaluate", idempotencyRequired: false, allowed: downloadable, precondition: "artifact_acl_and_scanner_clearance" }),
];

export const reviewCapabilities = (skillId: string, id: string, state: string, editable = false): Capability[] => [
  capability("read", "GET", `/api/v2/reviews/${id}`, { idempotencyRequired: false }),
  capability("revise", "POST", `/api/v2/skills/${skillId}/reviews/${id}/revisions`, { requiredPermission: "evaluate", allowed: editable && state === "pending" }),
  capability("respond", "POST", `/api/v2/skills/${skillId}/reviews/${id}/response`, { allowed: state !== "removed", humanOnly: true, precondition: "skill_author" }),
  capability("dispute", "POST", `/api/v2/skills/${skillId}/reviews/${id}/dispute`, { requiredPermission: "evaluate", allowed: state !== "removed", precondition: "clean_verified_evidence" }),
];

export const obligationCapabilities = (state: string): Capability[] => [
  capability("read_obligations", "GET", "/api/v2/me/obligations", { requiredPermission: "settlement:read", idempotencyRequired: false }),
  capability("await_settlement", "GET", "/api/v2/me/earnings", { requiredPermission: "settlement:read", idempotencyRequired: false, allowed: state !== "settled", precondition: "external_receipt_confirmation" }),
];
