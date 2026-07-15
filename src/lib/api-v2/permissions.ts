import type { MarketplacePermission } from "../../../convex/lib/authorization";

const prefixPermission: ReadonlyArray<readonly [string, MarketplacePermission]> = [
  ["validate_rfs", "rfs:write"],
  ["similar_rfs", "rfs:write"],
  ["create_rfs", "rfs:write"],
  ["revise_rfs:", "rfs:write"],
  ["cancel_rfs:", "rfs:write"],
  ["create_fixture_upload_intent", "rfs:write"],
  ["register_fixture", "rfs:write"],
  ["create_application:", "apply"],
  ["revise_application:", "apply"],
  ["withdraw_application:", "apply"],
  ["endorse_application:", "rfs:write"],
  ["submit_skill:", "submit"],
  ["create_signing_key_challenge", "evaluate"],
  ["confirm_signing_key", "evaluate"],
  ["upload_evidence:", "evaluate"],
  ["create_evaluation:", "evaluate"],
  ["supersede_evaluation:", "evaluate"],
  ["open_dispute:", "evaluate"],
  ["append_dispute_evidence:", "evaluate"],
  ["create_post_use_review:", "evaluate"],
  ["revise_post_use_review:", "evaluate"],
  ["respond_post_use_review:", "evaluate"],
  ["dispute_post_use_review:", "evaluate"],
  ["accept_review_assignment:", "evaluate"],
  ["decline_review_assignment:", "evaluate"],
  ["complete_review_assignment:", "evaluate"],
  ["verify_review_evidence:", "evaluate"],
];

const agentControlCommands = new Set(["request_delegation", "activate_delegation"]);

export const permissionForAgentCommand = (action: string): MarketplacePermission | "agent_control" | null => {
  if (agentControlCommands.has(action)) return "agent_control";
  return prefixPermission.find(([prefix]) => action.startsWith(prefix))?.[1] ?? null;
};
