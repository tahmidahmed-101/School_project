import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { DownloadIcon, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { extractApiError, getApiErrorMessage } from "@/lib/api/client"

/** "Export CSV" header button: shows a spinner while `onExport` runs and toasts its failure. */
export function ExportButton({
  onExport,
  label = "Export CSV",
  errorMessage = "Export failed",
  disabled = false,
}: {
  onExport: () => unknown | Promise<unknown>
  label?: ReactNode
  /** Toast text when the failure carries no message of its own. */
  errorMessage?: string
  disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    try {
      await onExport()
    } catch (err) {
      toast.error(getApiErrorMessage(extractApiError(err), errorMessage))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="primary" size="action" onClick={run} disabled={busy || disabled}>
      {busy ? <Loader2 className="size-5 animate-spin" /> : <DownloadIcon className="size-5" />} {label}
    </Button>
  )
}
