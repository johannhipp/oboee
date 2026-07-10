import { AgentManager } from "@/components/agent-manager";
import { WorkspaceState } from "@/components/workspace-state";
import { getAuthenticationStatus } from "@/lib/auth-server";
export const dynamic = "force-dynamic";
export default async function AgentsPage() { if (await getAuthenticationStatus() !== "authenticated") return <WorkspaceState title="Agents" message="Sign in to manage agent authority." signInPath="/me/agents" />; return <main><h1 className="text-xl font-medium">Agents</h1><p className="mt-1 text-sm text-muted-foreground">Keys authenticate; delegations constrain permissions, resources, time, and spend.</p><div className="mt-6"><AgentManager /></div></main>; }
