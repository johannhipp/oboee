import { PasskeyManager } from "@/components/passkey-manager";
import { WorkspaceState } from "@/components/workspace-state";
import { getAuthenticationStatus } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  if (await getAuthenticationStatus() !== "authenticated") {
    return <WorkspaceState title="Security" message="Sign in to manage passkeys." signInPath="/me/security" />;
  }
  return <main>
    <h1 className="text-xl font-medium">Security</h1>
    <p className="mt-1 text-sm text-muted-foreground">Passkeys confirm human-only decisions independently of agent credentials.</p>
    <div className="mt-6"><PasskeyManager /></div>
  </main>;
}
