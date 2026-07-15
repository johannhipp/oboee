interface AsciiBoxProps {
  title?: string
  children: React.ReactNode
  className?: string
}

export function AsciiBox({ title, children, className }: AsciiBoxProps) {
  return (
    <div className={`overflow-hidden border-y border-border py-4 ${className ?? ""}`}>
      {title ? <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{title}</p> : null}
      <div className={title ? "mt-4" : undefined}>{children}</div>
    </div>
  )
}
