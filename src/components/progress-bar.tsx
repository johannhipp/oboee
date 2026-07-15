import { formatTokenAmount } from "@/lib/view-models"

interface ProgressBarProps {
  current: number
  goal: number
  className?: string
}

export function ProgressBar({ current, goal, className }: ProgressBarProps) {
  const pct = goal > 0 ? Math.min(current / goal, 1) : 0
  const filled = Math.round(pct * 16)
  const empty = 16 - filled
  const bar = "█".repeat(filled) + "░".repeat(empty)

  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <div className="text-sm font-mono font-medium">
        ${formatTokenAmount(current)} / ${formatTokenAmount(goal)}
      </div>
      <div className="text-xs font-mono text-muted-foreground">
        [{bar}] {Math.round(pct * 100)}%
      </div>
    </div>
  )
}
