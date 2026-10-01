import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Label/value row for detail pages and dialogs; rows are divided by a hairline. */
export function DetailRow({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-border py-2 last:border-0", className)}>
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right text-sm font-medium text-foreground">{children}</span>
    </div>
  )
}
