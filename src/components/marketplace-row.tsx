import Link from "next/link";

import type { MarketplaceRowView } from "@/lib/marketplace";
import { CopyId } from "./copy-id";
import { MoneyText } from "./money-text";
import { StatusBadge } from "./status-badge";

type MarketplaceRowProps = {
  item: MarketplaceRowView;
};

export function MarketplaceRow({ item }: MarketplaceRowProps) {
  const title = item.detailHref ? (
    <Link
      href={item.detailHref}
      className="flex-1 font-medium text-sm truncate min-w-0 hover:underline underline-offset-2"
    >
      {item.title}
    </Link>
  ) : (
    <span className="flex-1 font-medium text-sm truncate min-w-0">
      {item.title}
    </span>
  );
  const amount =
    item.kind === "request" &&
    item.currentAmountBaseUnits !== undefined &&
    item.fundingThresholdBaseUnits !== undefined
      ? (
          <>
            <MoneyText baseUnits={item.currentAmountBaseUnits} /> /{" "}
            <MoneyText baseUnits={item.fundingThresholdBaseUnits} />
          </>
        )
      : item.purchasePriceBaseUnits !== undefined
        ? <MoneyText baseUnits={item.purchasePriceBaseUnits} />
        : "—";

  return (
    <div className="flex items-center gap-4 px-3 py-2.5 hover:bg-gray-50 transition-colors duration-150 rounded-md overflow-hidden min-w-0">
      {title}
      <StatusBadge status={item.status} />
      <span className="hidden sm:block w-28 text-right font-mono text-xs text-muted-foreground shrink-0">
        {amount}
      </span>
      <span className="hidden md:block w-24 shrink-0">
        {item.authorLabel === "you" ? (
          <span className="text-xs text-muted-foreground">you</span>
        ) : (
          <CopyId id={item.authorUserId} className="text-xs" />
        )}
      </span>
    </div>
  );
}
