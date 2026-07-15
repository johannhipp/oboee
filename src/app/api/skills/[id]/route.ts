import { fetchQuery } from "convex/nextjs";

import { api } from "../../../../../convex/_generated/api";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";
import { toSkillDetailDto } from "@/lib/api/dto";
import { ok, responseFromError } from "@/lib/api/http";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/skills/[id]">,
) {
  try {
    const { id } = await context.params;
    const authed = await isAuthenticated();
    const getDetail = authed ? fetchAuthQuery : fetchQuery;

    const detail = await getDetail(api.skills.getBySkill, { skillId: id });
    return ok(toSkillDetailDto(detail));
  } catch (error) {
    return responseFromError(error);
  }
}
