import type { ReactNode } from "react";

type TechnicalDetailsProps = {
  children: ReactNode;
  summary?: string;
  hint?: string;
  className?: string;
};

export function TechnicalDetails({
  children,
  summary = "Technical details",
  hint = "Optional",
  className,
}: TechnicalDetailsProps) {
  return (
    <details className={`group border-t border-border ${className ?? ""}`.trim()}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3 font-mono text-[11px] uppercase tracking-wide text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground [&::-webkit-details-marker]:hidden">
        <span>{summary}</span>
        <span className="flex min-w-0 items-center gap-2 text-right normal-case tracking-normal">
          <span className="hidden text-[10px] sm:inline">{hint}</span>
          <span aria-hidden="true" className="shrink-0 text-sm leading-none transition-transform group-open:rotate-45">
            +
          </span>
        </span>
      </summary>
      <div className="border-b border-border pb-4 pt-1">{children}</div>
    </details>
  );
}
