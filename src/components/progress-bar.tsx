import { formatTokenBaseUnits, progressPercent } from "../../shared/domain/money"

interface ProgressBarProps {
  current: bigint | string
  goal: bigint | string
  className?: string
}

export function ProgressBar({ current, goal, className }: ProgressBarProps) {
  const currentBaseUnits = typeof current === "bigint" ? current : BigInt(current)
  const goalBaseUnits = typeof goal === "bigint" ? goal : BigInt(goal)
  const pct = progressPercent(currentBaseUnits, goalBaseUnits)
  const filled = Math.round((pct / 100) * 16)
  const empty = 16 - filled
  const bar = "█".repeat(filled) + "░".repeat(empty)

  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <div className="text-sm font-mono font-medium">
        ${formatTokenBaseUnits(currentBaseUnits)} / ${formatTokenBaseUnits(goalBaseUnits)}
      </div>
      <div className="text-xs font-mono text-muted-foreground">
        [{bar}] {Math.round(pct)}%
      </div>
    </div>
  )
}
