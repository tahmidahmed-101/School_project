import { useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { ArchiveRestore, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { fetchAllPages } from "@/lib/api/fetchAll"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatDateTime } from "@/lib/format"
import { EmptyState } from "./EmptyState"
import { SubmitButton } from "./FormActions"

interface Props<T> {
  /** Plural, lower case: "products", "tax rates". Used in the dialog's title and messages. */
  noun: string
  /** The list endpoint; it is asked for its deleted rows only (`include_deleted` + `deleted_only`). */
  endpoint: string
  /** Extra list filters, e.g. `{ role: "customer" }`. */
  params?: Record<string, unknown>
  /** Calls the record's restore endpoint. */
  restore: (item: T) => Promise<unknown>
  label: (item: T) => ReactNode
  /** A second, muted line under the label (SKU, email, code…). */
  sub?: (item: T) => ReactNode
  /** Runs after each restore, e.g. to reload the list behind the dialog. */
  onRestored?: () => void
}

/**
 * "Deleted" button for a list page's header. Opens the deleted records of that list and
 * restores them one at a time. Works for any soft-delete resource with a restore endpoint.
 */
export function RestoreDeletedButton<T extends { id: string; deleted_at?: string | null }>({
  noun,
  endpoint,
  params,
  restore,
  label,
  sub,
  onRestored,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<T[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const paramsKey = JSON.stringify(params ?? {})

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetchAllPages<T>(endpoint, { ...(JSON.parse(paramsKey) as object), include_deleted: true, deleted_only: true })
      .then((rows) => {
        if (cancelled) return
        // Defensive: an endpoint that ignores `deleted_only` would otherwise list live records here.
        setItems(rows.filter((row) => row.deleted_at))
        setError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err)
      })
    return () => {
      cancelled = true
    }
  }, [open, endpoint, paramsKey, reloadKey])

  const handleRestore = async (item: T) => {
    setRestoringId(item.id)
    try {
      await restore(item)
      toast.success("Restored")
      setItems((prev) => prev?.filter((row) => row.id !== item.id) ?? null)
      onRestored?.()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to restore"))
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="action" onClick={() => setOpen(true)}>
        <ArchiveRestore className="size-5" /> Deleted
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Deleted {noun}</DialogTitle>
            <DialogDescription>Restore a record to put it back in the list.</DialogDescription>
          </DialogHeader>

          {error ? (
            <EmptyState
              title={`Couldn't load deleted ${noun}`}
              description={getApiErrorMessage(error)}
              actionLabel="Retry"
              onAction={() => setReloadKey((k) => k + 1)}
              className="py-6"
            />
          ) : items === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <EmptyState title="Nothing to restore" description={`No ${noun} have been deleted.`} className="py-6" />
          ) : (
            <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{label(item)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {sub && <>{sub(item)} · </>}
                      Deleted {formatDateTime(item.deleted_at)}
                    </span>
                  </span>
                  <SubmitButton
                    type="button"
                    variant="outline"
                    size="sm"
                    icon={RotateCcw}
                    loading={restoringId === item.id}
                    disabled={restoringId !== null}
                    onClick={() => void handleRestore(item)}
                  >
                    Restore
                  </SubmitButton>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
