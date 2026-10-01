import { Check, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Filter chip that adds soft-deleted records to a list (the backend's `include_deleted=true`).
 * A pressed toggle button rather than a switch, so it reads as a filter and its "on"
 * state is unmistakable at a glance.
 */
export function DeletedToggle({
  pressed,
  onPressedChange,
  label = "Show deleted",
  className,
}: {
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  label?: string
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      title={pressed ? "Deleted records are included — click to hide them" : "Include deleted records"}
      className={cn(
        "inline-flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pressed
          ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
          : "border-dashed border-border bg-transparent text-muted-foreground hover:border-solid hover:bg-muted hover:text-foreground",
        className
      )}
    >
      {pressed ? <Check className="size-4 shrink-0" /> : <Trash2 className="size-4 shrink-0" />}
      {label}
    </button>
  )
}
