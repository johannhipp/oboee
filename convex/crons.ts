import { cronJobs, makeFunctionReference } from "convex/server";

const crons = cronJobs();

crons.interval(
  "policy-v2 lifecycle reconciliation",
  { minutes: 15 },
  makeFunctionReference<"action", Record<string, never>, { processed: number }>("lifecycle:reconcileDue"),
  {},
);

export default crons;
