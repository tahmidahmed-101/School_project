import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface PageHeadingProps {
  title: ReactNode
  description?: ReactNode
  className?: string
}

/**
 * Canonical page title + description pair. Every route used to pick between two
 * unrelated heading styles (a hardcoded-gray one on list pages, a token-based one
 * on detail/form pages) with no documented rule for which applied where — this is
 * the single source now. Token-based so it's correct in dark mode by construction.
 */
export function PageHeading({ title, description, className }: PageHeadingProps) {
  return (
    <div className={cn(className)}>
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
      {description && (
        <p className="text-muted-foreground text-sm mt-1">{description}</p>
      )}
    </div>
  )
}
