import { AlertCircle, Loader2, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getApiErrorMessage } from "@/lib/api/client"

/** Loading / error placeholder for one settings section. Renders nothing once loaded. */
export function SectionState({
  status,
  error,
  hasData,
  onRetry,
  label,
}: {
  status: "idle" | "loading" | "succeeded" | "failed"
  error: unknown
  hasData: boolean
  onRetry: () => void
  label: string
}) {
  if (status === "failed" && !hasData) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{getApiErrorMessage(error, `Couldn't load ${label}.`)}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" /> Try again
        </Button>
      </div>
    )
  }
  if (!hasData) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading {label}...
      </div>
    )
  }
  return null
}
