import React from "react"
import { FolderSearch, Plus, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface EmptyStateProps {
  icon?: LucideIcon
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = FolderSearch,
  title = "No records found",
  description = "There are no items matching your criteria or available in this view.",
  actionLabel,
  onAction,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center select-none",
        className
      )}
    >
      {/* A bordered chip, so the icon reads as one object. The old tinted box and halo were the
          same colour as the table behind them, which left the icon floating in a large gap. */}
      <div className="mb-3 flex size-12 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
        <Icon className="size-6 stroke-[1.5]" />
      </div>

      <h3 className="text-base font-semibold text-foreground tracking-tight">
        {title}
      </h3>

      <p className="mt-1 text-sm text-muted-foreground max-w-sm">
        {description}
      </p>

      {actionLabel && onAction && (
        <Button
          variant="primary"
          size="sm"
          onClick={onAction}
          className="mt-4 flex items-center gap-1.5"
        >
          <Plus className="size-4" />
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
