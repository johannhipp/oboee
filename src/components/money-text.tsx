import { formatTokenBaseUnits } from "../../shared/domain/money";

type MoneyTextProps = {
  baseUnits: bigint | string;
  className?: string;
  currency?: string;
};

export function MoneyText({
  baseUnits,
  className,
  currency,
}: MoneyTextProps) {
  return (
    <span className={className}>
      ${formatTokenBaseUnits(baseUnits)}
      {currency ? ` ${currency}` : ""}
    </span>
  );
}
