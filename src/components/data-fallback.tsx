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
    <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mono text-xs text-amber-800">
      <span className="font-semibold uppercase">{title}</span>
      <span className="block mt-1 leading-relaxed">{message}</span>
    </div>
  )
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 px-3 py-2.5 rounded-md">
          <span className="h-3 w-6 rounded-sm bg-gray-100" />
          <span className="h-3 flex-1 rounded-sm bg-gray-100" />
          <span className="h-4 w-20 rounded-full bg-gray-100" />
          <span className="h-3 w-28 rounded-sm bg-gray-100" />
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
          <div className="h-7 w-2/3 rounded-sm bg-gray-100" />
          <div className="h-4 w-24 rounded-full bg-gray-100" />
          <div className="h-4 w-40 rounded-sm bg-gray-100" />
        </div>
        <AsciiBox title="scope">
          <div className="space-y-2">
            <div className="h-3 w-full rounded-sm bg-gray-100" />
            <div className="h-3 w-5/6 rounded-sm bg-gray-100" />
            <div className="h-3 w-2/3 rounded-sm bg-gray-100" />
          </div>
        </AsciiBox>
        <AsciiBox title="evaluation">
          <div className="space-y-2">
            <div className="h-3 w-48 rounded-sm bg-gray-100" />
            <div className="h-4 w-32 rounded-full bg-gray-100" />
            <div className="h-3 w-3/4 rounded-sm bg-gray-100" />
          </div>
        </AsciiBox>
      </div>
      <div className="lg:w-72 lg:shrink-0">
        <AsciiBox title="funding">
          <div className="space-y-3">
            <div className="h-2 w-full rounded-full bg-gray-100" />
            <div className="h-3 w-24 rounded-sm bg-gray-100" />
            <div className="h-9 w-full rounded-md bg-gray-100" />
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
