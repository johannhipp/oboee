import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import { skillStatusValidator } from "./validators";

export const skillMetadataValidator = v.object({
  _id: v.id("skills"),
  _creationTime: v.number(),
  rfsId: v.id("rfs"),
  authorUserId: v.string(),
  summary: v.string(),
  tags: v.array(v.string()),
  purchasePriceBaseUnits: v.int64(),
  status: skillStatusValidator,
});

export const toSkillMetadata = (skill: Doc<"skills">) => ({
  _id: skill._id,
  _creationTime: skill._creationTime,
  rfsId: skill.rfsId,
  authorUserId: skill.authorUserId,
  summary: skill.summary,
  tags: skill.tags,
  purchasePriceBaseUnits: skill.purchasePriceBaseUnits,
  status: skill.status,
});
