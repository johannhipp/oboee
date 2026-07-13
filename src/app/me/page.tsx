import Link from "next/link";
import { anyApi } from "convex/server";

import { WorkspaceState } from "@/components/workspace-state";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { toJsonValue } from "@/lib/json";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const records = (value: unknown): JsonRecord[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const stringValue = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : null;

const numberValue = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const humanize = (value: string) => value.replaceAll("_", " ");

const formatDate = (value: unknown) => {
  const timestamp = numberValue(value);
  return timestamp === null ? null : new Date(timestamp).toLocaleString();
};

const formatAmount = (value: unknown) => {
  const amount = stringValue(value) ?? numberValue(value)?.toString();
  return amount ? `${amount} base units` : null;
};

const firstString = (item: JsonRecord, keys: string[]) => {
  for (const key of keys) {
    const value = stringValue(item[key]);
    if (value) return value;
  }
  return null;
};

const resourceId = (item: JsonRecord) =>
  firstString(item, ["rfsId", "resourceId", "_id", "id"]);

const sectionConfig = [
  ["humanActions", "Decisions requiring approval", "Actions awaiting a passkey-confirmed decision."],
  ["obligations", "Settlement obligations", "Amounts with an unsettled transfer state."],
  ["reviewAssignments", "Assigned reviews", "Reviews assigned to this account."],
  ["assigned", "Assigned requests", "Requests this account is responsible for delivering."],
  ["applications", "Applications", "Applications submitted to requests."],
  ["requested", "Your requests", "Requests created by this account."],
] as const;

type SectionKey = (typeof sectionConfig)[number][0];

const summaryFor = (section: SectionKey, item: JsonRecord) => {
  const title = firstString(item, ["title", "name"]);
  const status = firstString(item, ["status", "state"]);
  const description = firstString(item, ["description", "reason", "scope"]);

  if (section === "humanActions") {
    return {
      label: "Requires approval",
      title: humanize(firstString(item, ["actionType"]) ?? "Human decision"),
      description: description ?? "A passkey-confirmed decision is waiting for you.",
      meta: [
        "Awaiting your decision",
        formatDate(item.expiresAt) ? `expires ${formatDate(item.expiresAt)}` : null,
      ].filter((value): value is string => Boolean(value)),
    };
  }

  if (section === "obligations") {
    return {
      label: "Settlement",
      title: humanize(firstString(item, ["kind"]) ?? "Unsettled obligation"),
      description: description ?? "This amount remains in the settlement queue.",
      meta: [formatAmount(item.amountBaseUnits), status ? humanize(status) : null].filter(
        (value): value is string => Boolean(value),
      ),
    };
  }

  return {
    label: section === "reviewAssignments" ? "Review" : section === "applications" ? "Application" : "Request",
    title: title ?? (section === "reviewAssignments" ? "Review assignment" : "Untitled request"),
    description: description ?? "Open the resource to see the current workflow.",
    meta: [
      status ? humanize(status) : null,
      formatDate(item.dueAt ?? item.deliveryDeadline ?? item.applicationDeadline)
        ? `due ${formatDate(item.dueAt ?? item.deliveryDeadline ?? item.applicationDeadline)}`
        : null,
      formatAmount(item.totalFundingTargetBaseUnits)
        ? `target ${formatAmount(item.totalFundingTargetBaseUnits)}`
        : null,
    ].filter((value): value is string => Boolean(value)),
  };
};

function WorkItem({ section, item }: { section: SectionKey; item: JsonRecord }) {
  const summary = summaryFor(section, item);
  const href = resourceId(item);
  const serialized = JSON.stringify(item, null, 2) ?? "{}";

  return (
    <article className="py-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {summary.label}
          </p>
          <h3 className="mt-1 font-medium">
            {href && section !== "humanActions" ? (
              <Link href={`/browse/${href}`} className="underline-offset-4 hover:underline">
                {summary.title}
              </Link>
            ) : (
              summary.title
            )}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {summary.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground sm:justify-end sm:text-right">
          {summary.meta.map((value) => (
            <span key={value}>{value}</span>
          ))}
        </div>
      </div>
      <details className="mt-3 border-t border-border pt-2">
        <summary className="w-fit cursor-pointer font-mono text-xs text-muted-foreground hover:text-foreground">
          resource details
        </summary>
        <pre
          tabIndex={0}
          className="mt-2 max-h-72 overflow-auto border-y border-border py-3 font-mono text-xs leading-5"
        >
          {serialized}
        </pre>
      </details>
    </article>
  );
}

export default async function WorkPage() {
  const auth = await getAuthenticationStatus();
  if (auth !== "authenticated") {
    return (
      <WorkspaceState
        title="Account workspace"
        message={
          auth === "unavailable"
            ? "The account backend is unavailable."
            : "Sign in to resume active work."
        }
        signInPath={auth === "unauthenticated" ? "/me" : undefined}
      />
    );
  }

  let work: JsonRecord | null = null;
  try {
    const value: unknown = toJsonValue(await fetchAuthQuery(anyApi.workspace.myWork, {}));
    work = isRecord(value) ? value : null;
  } catch {
    // Render the explicit unavailable state below.
  }

  if (!work) {
    return <WorkspaceState title="Active work" message="Active work could not be loaded." />;
  }

  return (
    <main>
      <h1 className="text-xl font-medium">Work</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Summary first. Resource identifiers and payloads are available in the expandable details.
      </p>
      <div className="mt-6 space-y-8">
        {sectionConfig.map(([key, title, description]) => {
          const items = records(work[key]);
          return (
            <section key={key}>
              <div className="flex items-end justify-between border-b border-border pb-2">
                <div>
                  <h2 className="font-medium">{title}</h2>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <span className="font-mono text-xs">{items.length}</span>
              </div>
              <div className="divide-y divide-border border-b border-border">
                {items.map((item, index) => (
                  <WorkItem key={stringValue(item._id) ?? `${key}-${index}`} section={key} item={item} />
                ))}
                {items.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">Nothing active.</p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
