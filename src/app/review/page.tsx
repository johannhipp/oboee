import { anyApi } from "convex/server";
import Link from "next/link";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { toJsonValue } from "@/lib/json";
import { WorkspaceState } from "@/components/workspace-state";
export const dynamic = "force-dynamic";
const humanize = (value: string) => value.replaceAll("_", " ");
type Assignment = {
  _id: string;
  rfsTitle: string;
  reason: string;
  tags: string[];
  dueAt: number;
  state: string;
};
export default async function ReviewPage() {
  if ((await getAuthenticationStatus()) !== "authenticated")
    return (
      <WorkspaceState
        title="Review assignments"
        message="Sign in with a trusted reviewer account."
        signInPath="/review"
      />
    );
  let rows: Assignment[];
  try {
    rows = toJsonValue(
      await fetchAuthQuery(anyApi.evaluationV2.listReviewAssignments, {}),
    ) as Assignment[];
  } catch {
    return (
      <WorkspaceState
        title="Review assignments"
        message="An active trusted reviewer role is required."
      />
    );
  }
  return (
    <main>
      <h1 className="text-xl font-medium">Review assignments</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Review evidence against the request criteria. Declare conflicts before accepting an assignment.
      </p>
      <div className="mt-6 divide-y divide-border border-y border-border">
        {rows.length ? (
          rows.map((row) => (
            <Link
              key={row._id}
              href={`/review/${row._id}`}
              className="grid gap-2 border-b border-border py-4 transition-colors hover:text-muted-foreground md:grid-cols-[1fr_auto]"
            >
              <div>
                <p className="font-medium">{row.rfsTitle}</p>
                <p className="mt-1 text-sm">{humanize(row.reason)}</p>
                <p className="text-sm text-muted-foreground">
                  {row.tags.join(", ") || "all tags"}
                </p>
              </div>
              <div className="text-right font-mono text-xs">
                <p>{humanize(row.state)}</p>
                <p className="text-muted-foreground">
                  due {new Date(row.dueAt).toLocaleString()}
                </p>
              </div>
            </Link>
          ))
        ) : (
          <p className="py-8 text-sm text-muted-foreground">
            No eligible assignments.
          </p>
        )}
      </div>
    </main>
  );
}
