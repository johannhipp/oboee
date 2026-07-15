import type { FunctionReturnType } from "convex/server";

import type { api } from "../../convex/_generated/api";

type RfsDetail = FunctionReturnType<typeof api.skills.getByRfs>;
export type AvailableAction = RfsDetail["availableActions"][number];
