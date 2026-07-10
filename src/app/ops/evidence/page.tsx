import { anyApi } from "convex/server";
import { ReasonAction } from "@/components/operator-controls";
import { WorkspaceState } from "@/components/workspace-state";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { toJsonValue } from "@/lib/json";
export const dynamic = "force-dynamic";
type Artifact = {
  artifactId: string;
  rfsId: string;
  classification: string;
  verificationState: string;
  scanState: string;
  legalHold: boolean;
  retentionDeleteAt: number;
  deletedAt?: number;
  resourceDigest: string;
};
export default async function EvidenceOpsPage() {
  if ((await getAuthenticationStatus()) !== "authenticated")
    return (
      <WorkspaceState
        title="Evidence operations"
        message="Sign in with a security operator account."
        signInPath="/ops/evidence"
      />
    );
  let rows: Artifact[];
  try {
    rows = toJsonValue(
      await fetchAuthQuery(anyApi.operations.evidenceQueue, {}),
    ) as Artifact[];
  } catch {
    return (
      <WorkspaceState
        title="Evidence operations"
        message="The security operator role is required."
      />
    );
  }
  return (
    <main>
      <h1 className="text-xl font-medium">Evidence retention</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Legal holds affect retention only; they do not alter verification.
      </p>
      <div className="mt-6 divide-y divide-border border-y border-border">
        {rows.map((item) => (
          <article
            key={item.artifactId}
            className="grid gap-3 py-4 lg:grid-cols-[1fr_auto]"
          >
            <div>
              <p className="font-mono text-xs break-all">{item.artifactId}</p>
              <p className="mt-1 text-sm">
                {item.classification} · {item.verificationState}/
                {item.scanState}
                {item.legalHold ? " · legal hold" : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                retention {new Date(item.retentionDeleteAt).toLocaleString()}
              </p>
            </div>
            <ReasonAction
              href={`/api/v2/ops/evidence/${item.artifactId}/legal-hold`}
                label={item.legalHold ? "release hold" : "place hold"}
                fields={{ held: !item.legalHold, expectedDigest: item.resourceDigest }}
              dangerous={!item.legalHold}
            />
          </article>
        ))}
      </div>
    </main>
  );
}
