import { v } from "convex/values";

export const rfsStatusValidator = v.union(
  v.literal("open"),
  v.literal("funded"),
  v.literal("assigned"),
  v.literal("submitted"),
  v.literal("evaluation_open"),
  v.literal("accepted"),
  v.literal("revision_requested"),
  v.literal("disputed"),
  v.literal("rejected"),
  v.literal("published"),
  v.literal("cancelled"),
  v.literal("fulfilled"),
);

export const skillStatusValidator = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("evaluation_open"),
  v.literal("accepted"),
  v.literal("revision_requested"),
  v.literal("disputed"),
  v.literal("rejected"),
  v.literal("published"),
);

export const payoutAssessmentStatusValidator = v.union(
  v.literal("pending"),
  v.literal("claimable"),
  v.literal("reduced"),
  v.literal("blocked"),
  v.literal("disputed"),
  v.literal("manually_resolved"),
  v.literal("claimed"),
);
