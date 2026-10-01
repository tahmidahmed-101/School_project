import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { AlertCircle, Lock, RotateCcw, type LucideIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/common/EmptyState"
import { getApiErrorMessage } from "@/lib/api/client"
import { isForbidden } from "../hooks"
import { cn } from "@/lib/utils"

export function WidgetError({
  error,
  onRetry,
  className,
}: {
  error: unknown
  onRetry?: () => void
  className?: string
}) {
  if (isForbidden(error)) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 py-10 px-4 text-center", className)}>
        <Lock className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">You don't have permission to view this report.</p>
      </div>
    )
  }
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3 py-10 px-4 text-center", className)}
      role="alert"
    >
      <div className="flex size-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertCircle className="size-5" aria-hidden />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Couldn't load this data</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          {getApiErrorMessage(error, "The request failed. Please try again.")}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="size-3.5" aria-hidden />
          Retry
        </Button>
      )}
    </div>
  )
}

export interface ReportWidgetProps {
  title: ReactNode
  description?: ReactNode
  /** Header link, e.g. { to: "/inventory", label: "View stock" }. */
  link?: { to: string; label: string }
  headerExtra?: ReactNode
  isLoading: boolean
  error: unknown
  onRetry?: () => void
  isEmpty: boolean
  skeleton: ReactNode
  emptyIcon?: LucideIcon
  emptyTitle: string
  emptyDescription?: string
  className?: string
  contentClassName?: string
  children: ReactNode
}

/**
 * Card shell shared by every report widget: one place deciding loading → error → empty →
 * content, so each widget always has all four states.
 */
export function ReportWidget({
  title,
  description,
  link,
  headerExtra,
  isLoading,
  error,
  onRetry,
  isEmpty,
  skeleton,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  className,
  contentClassName,
  children,
}: ReportWidgetProps) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border px-5 py-4 [.border-b]:pb-4">
        <div className="min-w-0">
          <CardTitle level={2} className="text-base font-semibold">
            {title}
          </CardTitle>
          {description && <CardDescription className="mt-0.5 text-xs">{description}</CardDescription>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {headerExtra}
          {link && (
            <Link to={link.to} className="text-sm font-medium text-primary hover:underline">
              {link.label}
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className={cn("flex-1 p-5", contentClassName)}>
        {error ? (
          <WidgetError error={error} onRetry={onRetry} />
        ) : isLoading ? (
          <div role="status" aria-live="polite" aria-label="Loading">
            {skeleton}
          </div>
        ) : isEmpty ? (
          <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} className="py-8" />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}
