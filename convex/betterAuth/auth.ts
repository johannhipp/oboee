import type { GenericCtx } from "@convex-dev/better-auth";

import type { DataModel } from "../_generated/dataModel";
import { createAuth } from "../auth";

// Static instance used only by the Better Auth schema generator.
export const auth = createAuth({} as GenericCtx<DataModel>);
