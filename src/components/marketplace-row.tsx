import Link from "next/link";

export function MarketplaceRow({ item }: { item: { id: string; kind: "rfs" | "skill"; title: string; status: string; tags: string[]; authorHandle?: string; scoreBps?: number; confidence?: string; amount?: string } }) {
  return (
    <article className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border px-2 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[11px] uppercase text-muted-foreground">{item.kind}</span>
          <Link href={`/browse/${item.id}`} className="truncate text-sm font-medium underline-offset-4 hover:underline">{item.title}</Link>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
          {item.authorHandle ? <Link href={`/authors/${item.authorHandle}`} className="hover:text-foreground">@{item.authorHandle}</Link> : null}
          {item.tags.slice(0, 4).map((tag) => <span key={tag}>#{tag}</span>)}
        </div>
      </div>
      <div className="text-right font-mono text-xs tabular-nums">
        <div>{item.status}</div>
        {item.scoreBps !== undefined ? <div className="text-muted-foreground">{(item.scoreBps / 100).toFixed(1)}% · {item.confidence}</div> : null}
        {item.amount ? <div className="text-muted-foreground">{item.amount} base units</div> : null}
      </div>
    </article>
  );
}
