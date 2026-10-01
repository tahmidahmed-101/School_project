import { Users } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCount } from "../measure"
import type { CustomerSegment } from "../types"
import { ReportWidget } from "./ReportWidget"

const DESCRIPTIONS: Record<string, string> = {
  New: "No paid orders yet",
  Active: "1–2 paid orders",
  VIP: "3+ paid orders",
}

interface Props {
  segments: CustomerSegment[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  className?: string
}

export function CustomerSegments({ segments, isLoading, error, onRetry, className }: Props) {
  const total = (segments ?? []).reduce((s, seg) => s + seg.count, 0)
  return (
    <ReportWidget
      title="Customer segments"
      description={`All active customers${total ? ` · ${formatCount(total)} total` : ""} (not filtered by date)`}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      isEmpty={total === 0}
      emptyIcon={Users}
      emptyTitle="No customers yet"
      emptyDescription="Segments appear once customers sign up."
      skeleton={
        <div className="flex flex-col gap-4">
          <Skeleton className="h-3 w-full" />
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      }
      className={className}
    >
      <div className="mb-5 flex h-3 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {segments
          ?.filter((s) => s.count > 0)
          .map((s) => (
            <div key={s.name} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
          ))}
      </div>
      <ul className="flex flex-col gap-3">
        {segments?.map((s) => (
          <li key={s.name} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
              <div>
                <p className="text-sm font-medium">{s.name}</p>
                {DESCRIPTIONS[s.name] && (
                  <p className="text-xs text-muted-foreground">{DESCRIPTIONS[s.name]}</p>
                )}
              </div>
            </div>
            <p className="text-sm tabular-nums">
              <span className="font-medium">{formatCount(s.count)}</span>{" "}
              <span className="text-muted-foreground">· {s.pct}%</span>
            </p>
          </li>
        ))}
      </ul>
    </ReportWidget>
  )
}
