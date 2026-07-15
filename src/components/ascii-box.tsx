interface AsciiBoxProps {
  title?: string
  children: React.ReactNode
  className?: string
}

export function AsciiBox({ title, children, className }: AsciiBoxProps) {
  return (
    <div className={`font-mono text-sm overflow-hidden ${className ?? ""}`}>
      <div className="text-border select-none flex">
        <span className="shrink-0">┌─</span>
        {title && (
          <span className="shrink-0 text-muted-foreground px-1">{title}</span>
        )}
        <span className="flex-1 overflow-hidden whitespace-nowrap">
          {"─".repeat(200)}
        </span>
        <span className="shrink-0">─┐</span>
      </div>
      <div className="border-l border-r border-border px-4 py-3 overflow-hidden">{children}</div>
      <div className="text-border select-none flex">
        <span className="shrink-0">└─</span>
        <span className="flex-1 overflow-hidden whitespace-nowrap">
          {"─".repeat(200)}
        </span>
        <span className="shrink-0">─┘</span>
      </div>
    </div>
  )
}
