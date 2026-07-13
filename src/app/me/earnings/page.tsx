import { anyApi } from "convex/server";

import { WorkspaceState } from "@/components/workspace-state";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { toJsonValue } from "@/lib/json";

type Obligation = {
  _id: string;
  kind: string;
  amountBaseUnits: string | number;
  state: string;
  tokenAddress: string;
  network?: string;
  rfsId?: string;
  failureCode?: string;
  transferState?: string;
};

type Batch = {
  _id: string;
  amountBaseUnits: string | number;
  state: string;
  tokenAddress: string;
  network?: string;
  periodStartedAt: number;
  periodEndedAt: number;
};

type EarningsData = { obligations: Obligation[]; purchaseBatches: Batch[] };
type SettlementRow = Obligation | Batch;

export const dynamic = "force-dynamic";

const humanize = (value: string) => value.replaceAll("_", " ");
const formatAmount = (value: string | number) => `${String(value)} base units`;

function SettlementRowView({ row }: { row: SettlementRow }) {
  const isObligation = "kind" in row;
  const label = isObligation ? humanize(row.kind) : "Purchase earnings";
  const transferState = isObligation && row.transferState ? humanize(row.transferState) : null;
  const description = isObligation && row.failureCode
    ? "This transfer requires attention."
    : transferState
      ? `Transfer state: ${transferState}.`
      : "Recorded settlement amount.";

  return (
    <article className="py-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div>
          <p className="font-medium capitalize">{label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="sm:text-right">
          <p className="font-mono text-sm">{formatAmount(row.amountBaseUnits)}</p>
          <p className="font-mono text-xs text-muted-foreground">{humanize(row.state)}</p>
        </div>
      </div>
      <details className="mt-3 border-t border-border pt-2">
        <summary className="w-fit cursor-pointer font-mono text-xs text-muted-foreground hover:text-foreground">
          Identifiers and destination
        </summary>
        <dl className="mt-2 grid gap-2 border-y border-border py-3 text-xs sm:grid-cols-[8rem_minmax(0,1fr)]">
          <dt className="font-mono text-muted-foreground">obligation</dt>
          <dd className="break-all font-mono">{row._id}</dd>
          {isObligation && row.rfsId ? (
            <>
              <dt className="font-mono text-muted-foreground">request</dt>
              <dd className="break-all font-mono">{row.rfsId}</dd>
            </>
          ) : null}
          <dt className="font-mono text-muted-foreground">destination</dt>
          <dd className="break-all font-mono">{row.network ? `${row.network}:` : ""}{row.tokenAddress}</dd>
          {isObligation && row.failureCode ? (
            <>
              <dt className="font-mono text-muted-foreground">failure</dt>
              <dd className="break-all font-mono">{row.failureCode}</dd>
            </>
          ) : null}
        </dl>
      </details>
    </article>
  );
}

function SettlementList({ rows, empty }: { rows: SettlementRow[]; empty: string }) {
  return (
    <div className="divide-y divide-border border-y border-border">
      {rows.map((row) => <SettlementRowView key={row._id} row={row} />)}
      {rows.length === 0 ? <p className="py-6 text-sm text-muted-foreground">{empty}</p> : null}
    </div>
  );
}

export default async function EarningsPage() {
  if (await getAuthenticationStatus() !== "authenticated") {
    return <WorkspaceState title="Settlement" message="Sign in to inspect settlement state." signInPath="/me/earnings" />;
  }

  let data: EarningsData | null = null;
  try {
    const [obligations, batches] = await Promise.all([
      fetchAuthQuery(anyApi.settlements.myObligations, {}),
      fetchAuthQuery(anyApi.workspace.myEarnings, {}),
    ]);
    const payload = toJsonValue({ obligations, purchaseBatches: batches }) as {
      obligations: Array<{ obligation: Obligation; transfer?: { state: string } | null }>;
      purchaseBatches: Batch[];
    };
    data = {
      obligations: payload.obligations.map(({ obligation, transfer }) => ({
        ...obligation,
        transferState: transfer?.state,
      })),
      purchaseBatches: payload.purchaseBatches,
    };
  } catch {
    // Render the unavailable state below.
  }

  if (!data) return <WorkspaceState title="Settlement" message="Settlement data could not be loaded." />;

  return (
    <main>
      <h1 className="text-xl font-medium">Settlement</h1>
      <p className="mt-1 text-sm text-muted-foreground">Amounts and transfer state are shown separately from their resource identifiers.</p>
      <section className="mt-6">
        <h2 className="mb-3 font-medium">Obligations</h2>
        <SettlementList rows={data.obligations} empty="No settlement obligations." />
      </section>
      <section className="mt-8">
        <h2 className="mb-3 font-medium">Purchase earnings</h2>
        <SettlementList rows={data.purchaseBatches} empty="No purchase earnings." />
      </section>
    </main>
  );
}
