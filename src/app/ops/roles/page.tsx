import { anyApi } from "convex/server";
import { ReasonAction, RoleGrantForm } from "@/components/operator-controls";
import { WorkspaceState } from "@/components/workspace-state";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { toJsonValue } from "@/lib/json";
export const dynamic = "force-dynamic";
type Role = {
  _id: string;
  principalId: string;
  role: string;
  tags: string[];
  activeFrom: number;
  activeUntil: number;
  revokedAt?: number;
  reason: string;
  resourceDigest: string;
};
export default async function RolesPage() {
  if ((await getAuthenticationStatus()) !== "authenticated")
    return (
      <WorkspaceState
        title="Platform roles"
        message="Sign in with a platform operator account."
        signInPath="/ops/roles"
      />
    );
  let rows: Role[];
  try {
    rows = toJsonValue(
      await fetchAuthQuery(anyApi.platform.listPlatformRoles, {}),
    ) as Role[];
  } catch {
    return (
      <WorkspaceState
        title="Platform roles"
        message="The platform operator role is required."
      />
    );
  }
  return (
    <main>
      <h1 className="text-xl font-medium">Platform roles</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Time-bound grants with optional tag scope.
      </p>
      <div className="mt-6">
        <RoleGrantForm />
      </div>
      <div className="mt-8 divide-y divide-border border-y border-border">
        {rows.map((role) => (
          <article
            key={role._id}
            className="grid gap-3 py-4 lg:grid-cols-[1fr_auto]"
          >
            <div>
              <p className="font-mono text-xs break-all">{role.principalId}</p>
              <p className="mt-1 text-sm">
                {role.role} · {role.tags.join(", ") || "all tags"}
              </p>
              <p className="text-xs text-muted-foreground">
                until {new Date(role.activeUntil).toLocaleString()} ·{" "}
                {role.revokedAt ? "revoked" : "active"} · {role.reason}
              </p>
            </div>
            {!role.revokedAt ? (
              <ReasonAction
                  href={`/api/v2/ops/roles/${role._id}/revoke`}
                  label="revoke"
                  fields={{ expectedDigest: role.resourceDigest }}
                  dangerous
              />
            ) : null}
          </article>
        ))}
      </div>
    </main>
  );
}
