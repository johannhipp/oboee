import { anyApi } from "convex/server";
import { HumanActions } from "@/components/human-actions";
import { WorkspaceState } from "@/components/workspace-state";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { toJsonValue } from "@/lib/json";
export const dynamic = "force-dynamic";
export default async function ActionsPage() { if (await getAuthenticationStatus() !== "authenticated") return <WorkspaceState title="Actions requiring approval" message="Sign in to inspect pending decisions." signInPath="/me/actions" />; let actions: Record<string, unknown>[] = []; try { const work = toJsonValue(await fetchAuthQuery(anyApi.workspace.myWork, {})) as { humanActions?: Record<string, unknown>[] }; actions = work.humanActions ?? []; } catch {} return <main><h1 className="text-xl font-medium">Actions requiring approval</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Passkey verification is required. The action URL does not grant authority.</p><div className="mt-6"><HumanActions actions={actions} /></div></main>; }
