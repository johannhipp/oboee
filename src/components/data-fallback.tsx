import { AsciiBox } from "./ascii-box"

interface DataToastProps {
  title?: string
  message?: string
}

export function DataToast({
  title = "local data unavailable",
  message = "Convex is not configured or is not reachable, so this page is showing placeholders where live data would normally appear.",
}: DataToastProps) {
  return (
    <div className="mb-6 border-y border-amber-300 py-3 font-mono text-xs text-amber-800">
      <span className="font-semibold uppercase tracking-[0.12em]">{title}</span>
      <span className="mt-1 block leading-relaxed">{message}</span>
    </div>
  )
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-border py-3">
          <span className="h-3 w-6 border-b border-border" />
          <span className="h-3 flex-1 border-b border-border" />
          <span className="h-4 w-20 border-y border-border" />
          <span className="h-3 w-28 border-b border-border" />
        </div>
      ))}
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="flex flex-col lg:flex-row gap-8 my-8">
      <div className="flex-1 min-w-0 space-y-6">
        <div className="space-y-3">
          <div className="h-7 w-2/3 border-b border-border" />
          <div className="h-4 w-24 border-y border-border" />
          <div className="h-4 w-40 border-b border-border" />
        </div>
        <AsciiBox title="scope">
          <div className="space-y-2">
            <div className="h-3 w-full border-b border-border" />
            <div className="h-3 w-5/6 border-b border-border" />
            <div className="h-3 w-2/3 border-b border-border" />
          </div>
        </AsciiBox>
        <AsciiBox title="evaluation">
          <div className="space-y-2">
            <div className="h-3 w-48 border-b border-border" />
            <div className="h-4 w-32 border-y border-border" />
            <div className="h-3 w-3/4 border-b border-border" />
          </div>
        </AsciiBox>
      </div>
      <div className="lg:w-72 lg:shrink-0">
        <AsciiBox title="funding">
          <div className="space-y-3">
            <div className="h-2 w-full border-y border-border" />
            <div className="h-3 w-24 border-b border-border" />
            <div className="h-9 w-full border-b border-border" />
          </div>
        </AsciiBox>
      </div>
    </div>
  )
}

export function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <AsciiBox title="my requests">
        <SkeletonRows count={3} />
      </AsciiBox>
      <AsciiBox title="contributions">
        <SkeletonRows count={2} />
      </AsciiBox>
      <AsciiBox title="purchased">
        <SkeletonRows count={2} />
      </AsciiBox>
    </div>
  )
}
