import { anyApi } from "convex/server";
import { ReasonAction } from "@/components/operator-controls";
import { WorkspaceState } from "@/components/workspace-state";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { toJsonValue } from "@/lib/json";
export const dynamic = "force-dynamic";
type Data = {
  progress: {
    _id: string;
    migrationKey: string;
    version: number;
    processedCount: number;
    completed: boolean;
  }[];
  findings: {
    _id: string;
    findingType: string;
    resourceType: string;
    resourceId: string;
    details: string;
      status: string;
      resourceDigest: string;
  }[];
};
export default async function MigrationsPage() {
  if ((await getAuthenticationStatus()) !== "authenticated")
    return (
      <WorkspaceState
        title="Migrations"
        message="Sign in with a platform operator account."
        signInPath="/ops/migrations"
      />
    );
  let data: Data;
  try {
    data = toJsonValue(
      await fetchAuthQuery(anyApi.operations.migrationQueue, {}),
    ) as Data;
  } catch {
    return (
      <WorkspaceState
        title="Migrations"
        message="The platform operator role is required."
      />
    );
  }
  return (
    <main>
      <h1 className="text-xl font-medium">Migrations</h1>
      <section className="mt-6">
        <h2 className="font-medium">Progress</h2>
        <div className="mt-2 divide-y divide-border border-y border-border">
          {data.progress.map((item) => (
            <p key={item._id} className="py-3 text-sm">
              <span className="font-mono">{item.migrationKey}</span> · v
              {item.version} · {item.processedCount} rows ·{" "}
              {item.completed ? "complete" : "running"}
            </p>
          ))}
        </div>
      </section>
      <section className="mt-8">
        <h2 className="font-medium">Review findings</h2>
        <div className="mt-2 divide-y divide-border border-y border-border">
          {data.findings.map((item) => (
            <article
              key={item._id}
              className="grid gap-3 py-4 lg:grid-cols-[1fr_auto]"
            >
              <div>
                <p className="font-medium">
                  {item.findingType.replaceAll("_", " ")}
                </p>
                <p className="font-mono text-xs break-all">
                  {item.resourceType}:{item.resourceId}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.details}
                </p>
              </div>
              {item.status === "open" ? (
                <div className="space-y-2">
                  <ReasonAction
                    href={`/api/v2/ops/migrations/${item._id}/resolve`}
                        label="resolve"
                        fields={{ resolution: "resolved", expectedDigest: item.resourceDigest }}
                  />
                  <ReasonAction
                    href={`/api/v2/ops/migrations/${item._id}/resolve`}
                        label="ignore"
                        fields={{ resolution: "ignored", expectedDigest: item.resourceDigest }}
                    dangerous
                  />
                </div>
              ) : (
                <p className="text-sm">{item.status}</p>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
