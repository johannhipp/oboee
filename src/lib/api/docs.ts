import {
  API_ROUTE_CONTRACT,
  type ApiOperationId,
} from "./contract";

export const DOCUMENTED_API_ROUTES = API_ROUTE_CONTRACT;

type RequestExample = {
  requiredFields: readonly string[];
  body: Record<string, string | string[]>;
};

export const API_REQUEST_EXAMPLES = {
  updateWallet: {
    requiredFields: ["walletAddress"],
    body: { walletAddress: "0x1111111111111111111111111111111111111111" },
  },
  createRfs: {
    requiredFields: [
      "title",
      "description",
      "scope",
      "tags",
      "fundingThresholdBaseUnits",
      "minimumContributionBaseUnits",
    ],
    body: {
      title: "Research request",
      description: "Public context",
      scope: "Bounded deliverable",
      tags: ["security"],
      fundingThresholdBaseUnits: "9000",
      minimumContributionBaseUnits: "1",
    },
  },
  fundRfs: {
    requiredFields: ["amount"],
    body: { amount: "0.003" },
  },
  submitSkill: {
    requiredFields: [
      "contentMarkdown",
      "summary",
      "tags",
      "purchasePriceBaseUnits",
    ],
    body: {
      contentMarkdown: "# Skill",
      summary: "Public summary",
      tags: ["security"],
      purchasePriceBaseUnits: "5000",
    },
  },
} satisfies Partial<Record<ApiOperationId, RequestExample>>;

export const AGENT_OPERATION_IDS = [
  "listMarketplace",
  "getRfs",
  "getSkill",
  "fundRfs",
  "readSkillContent",
] as const satisfies readonly ApiOperationId[];
