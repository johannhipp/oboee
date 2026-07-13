import Link from "next/link";

type MarketplaceItem = {
  id: string;
  kind: "rfs" | "skill";
  title: string;
  status: string;
  tags: string[];
  authorHandle?: string;
  scoreBps?: number;
  confidence?: string;
  amount?: string;
};

const statusLabels: Record<string, string> = {
  assigned: "in progress",
  cancelled: "cancelled",
  clear: "ready",
  disputed: "disputed",
  evaluation_open: "in review",
  fulfilled: "fulfilled",
  funded: "funded",
  open: "open",
  published: "published",
  rejected: "rejected",
  submitted: "submitted",
};

const formatStatus = (status: string) => statusLabels[status] ?? status.replaceAll("_", " ");

const formatUnits = (amount: string) => {
  const value = Number(amount);
  if (!Number.isSafeInteger(value)) return `${amount} units`;
  return `${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)} units`;
};

const formatScore = (scoreBps: number) => `${(scoreBps / 100).toFixed(1)}%`;

export function MarketplaceRow({ item }: { item: MarketplaceItem }) {
  const kindLabel = item.kind === "rfs" ? "request" : "skill";

  return (
    <article className="grid gap-3 border-b border-border py-4 first:border-t sm:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)] sm:gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{kindLabel}</span>
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">· {formatStatus(item.status)}</span>
        </div>
        <Link href={`/browse/${item.id}`} className="mt-2 block break-words text-[15px] font-medium leading-5 underline-offset-4 hover:underline">
          {item.title}
        </Link>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
          {item.authorHandle ? <Link href={`/authors/${item.authorHandle}`} className="hover:text-foreground">by @{item.authorHandle}</Link> : null}
          {item.tags.slice(0, 4).map((tag) => <span key={tag}>#{tag}</span>)}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums text-muted-foreground sm:block sm:min-w-36 sm:text-right">
        {item.amount ? <div>target {formatUnits(item.amount)}</div> : null}
        {item.scoreBps !== undefined ? <div>quality {formatScore(item.scoreBps)}{item.confidence ? <span> · {item.confidence}</span> : null}</div> : null}
      </div>
    </article>
  );
}
