import { isRouteErrorResponse, useRouteError } from "react-router-dom"
import { TriangleAlert } from "lucide-react"
import { EmptyState } from "@/components/common/EmptyState"
import NotFound from "@/routes/NotFound"

const RELOAD_FLAG = "route-error:chunk-reloaded"

// After a redeploy, lazily-loaded chunks with old hashes no longer exist on the server.
function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "")
  return /dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically/i.test(
    message
  )
}

const RouteError = () => {
  const error = useRouteError()

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFound />
  }

  if (isChunkLoadError(error)) {
    // Reload once to pick up the new build; the flag prevents a reload loop.
    let alreadyReloaded: boolean
    try {
      alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === "1"
      if (!alreadyReloaded) sessionStorage.setItem(RELOAD_FLAG, "1")
    } catch {
      alreadyReloaded = true
    }
    if (!alreadyReloaded) {
      window.location.reload()
      return null
    }
  }

  return (
    <EmptyState
      icon={TriangleAlert}
      title={isChunkLoadError(error) ? "A new version is available" : "Something went wrong"}
      description={
        isChunkLoadError(error)
          ? "This page couldn't load because the app was updated. Reload to continue."
          : "An unexpected error occurred while showing this page."
      }
      actionLabel="Reload page"
      onAction={() => {
        try {
          sessionStorage.removeItem(RELOAD_FLAG)
        } catch {
          // storage unavailable; reload anyway
        }
        window.location.reload()
      }}
      className="min-h-[60vh]"
    />
  )
}

export default RouteError
