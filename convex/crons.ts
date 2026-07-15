import { cronJobs, makeFunctionReference } from "convex/server";

const crons = cronJobs();

crons.interval(
  "policy-v2 lifecycle reconciliation",
  { minutes: 15 },
  makeFunctionReference<"action", Record<string, never>, { processed: number }>("lifecycle:reconcileDue"),
  {},
);

crons.interval(
  "policy-v2 settlement outbox",
  { minutes: 1 },
  makeFunctionReference<"action", Record<string, never>, { prepared: number; processed: number; confirmed: number; failed: number }>("settlements:processSettlementOutbox"),
  {},
);

export default crons;
