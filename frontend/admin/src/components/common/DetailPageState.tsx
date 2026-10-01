import { Link } from "react-router-dom"
import { AlertCircle, ArrowLeft, Loader2, RotateCcw, SearchX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getApiErrorMessage } from "@/lib/api/client"

interface DetailPageStateProps {
  state: "loading" | "not-found" | "error"
  entity: string
  backTo: string
  backLabel: string
  error?: unknown
  onRetry?: () => void
}

export function DetailPageState({ state, entity, backTo, backLabel, error, onRetry }: DetailPageStateProps) {
  if (state === "loading") {
    return (
      <div
        className="section-container py-16 flex flex-col items-center justify-center text-center space-y-4"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Loading {entity.toLowerCase()} details...</p>
      </div>
    )
  }

  const isError = state === "error"
  const Icon = isError ? AlertCircle : SearchX

  return (
    <div
      className="section-container py-16 flex flex-col items-center justify-center text-center space-y-4"
      role={isError ? "alert" : undefined}
    >
      <div className="rounded-full bg-destructive/10 p-4">
        <Icon className="h-10 w-10 text-destructive" />
      </div>
      <h2 className="text-2xl font-bold">{isError ? `Couldn't load ${entity.toLowerCase()}` : `${entity} not found`}</h2>
      <p className="text-muted-foreground text-sm max-w-sm">
        {isError
          ? getApiErrorMessage(error, "Something went wrong while loading this record. Please try again.")
          : `The ${entity.toLowerCase()} you're looking for doesn't exist or may have been deleted.`}
      </p>
      <div className="flex gap-3 mt-4">
        {isError && onRetry && (
          <Button onClick={onRetry}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Try again
          </Button>
        )}
        <Button variant={isError ? "outline" : "default"} asChild>
          <Link to={backTo}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {backLabel}
          </Link>
        </Button>
      </div>
    </div>
  )
}
