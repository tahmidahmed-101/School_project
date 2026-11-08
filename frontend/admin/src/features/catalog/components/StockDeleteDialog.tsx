import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DialogActions } from "@/components/common/FormDialog"
import { useCan } from "@/hooks/use-can"
import { fetchAllPages } from "@/lib/api/fetchAll"
import { getApiErrorMessage } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { postWriteOff, releaseReservation } from "@/features/inventory/api"
import type { StockItem, StockReservation } from "@/features/inventory/types"

import { isBlockedByStock, isDeletable, stockTotals } from "../deleteGuard"

const DEFAULT_REASON = "Cleared before deletion"

interface Holdings {
  stock: StockItem[]
  reservations: StockReservation[]
}

interface Props {
  /** False while the dialog animates shut; the caller unmounts it once that is over. */
  open: boolean
  /** What is being deleted, as the admin knows it. */
  name: string
  /** Whose stock and reservations stand in the way: a whole product's or one variant's. */
  scope: { product_id: string } | { variant_id: string }
  /** The delete call itself; it rejects with the API error when the backend refuses. */
  remove: () => Promise<unknown>
  onDeleted: () => void
  onClose: () => void
  /** Stock or a reservation changed, so the list behind the dialog is out of date. */
  onStockChanged: () => void
}

/**
 * Deletes a product or a variant without leaving the page. With nothing on hand or reserved it
 * is a plain confirmation; otherwise it shows what still holds the item and lets the admin write
 * the stock off and release the reservations here. The backend enforces the same rule on delete.
 */
export function StockDeleteDialog({ open, name, scope, remove, onDeleted, onClose, onStockChanged }: Props) {
  const scopeKey = JSON.stringify(scope)
  const canAdjust = useCan("inventory.adjust", "inventory.manage")
  const canRelease = useCan("orders.manage")

  const [holdings, setHoldings] = useState<Holdings | null>(null)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  // The backend's own refusal, shown when it knows of a blocker this user cannot list.
  const [refusal, setRefusal] = useState<string | null>(null)

  const load = useCallback(async () => {
    // Either list may be forbidden for this user; the delete itself still reports any blocker.
    const [stock, reservations] = await Promise.all([
      fetchAllPages<StockItem>("/admin/inventory/stock-items/", JSON.parse(scopeKey)).catch(() => []),
      fetchAllPages<StockReservation>("/admin/orders/reservations/", {
        ...JSON.parse(scopeKey),
        status: "active",
      }).catch(() => []),
    ])
    return { stock, reservations }
  }, [scopeKey])

  useEffect(() => {
    let cancelled = false
    void load().then((next) => {
      if (!cancelled) setHoldings(next)
    })
    return () => {
      cancelled = true
    }
  }, [load])

  const afterChange = async () => {
    setRefusal(null)
    setQuantities({})
    setHoldings(await load())
    onStockChanged()
  }

  const stock = (holdings?.stock ?? []).filter((s) => s.quantity_on_hand > 0 || s.quantity_reserved > 0)
  const reservations = holdings?.reservations ?? []
  const totals = stockTotals(stock)
  const blocked = !isDeletable(stock, reservations.length) || refusal !== null
  const working = busy !== null

  const writeOff = async (item: StockItem) => {
    const quantity = Number(quantities[item.id] ?? item.available)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > item.available) {
      toast.error(`Enter a whole number from 1 to ${item.available}`)
      return
    }
    setBusy(item.id)
    try {
      await postWriteOff({
        variant_id: item.variant_id,
        kind: "stock",
        warehouse_id: item.warehouse_id,
        quantity,
        reason: reason.trim() || DEFAULT_REASON,
      })
      toast.success(`Wrote off ${quantity} × ${item.variant_sku}`)
      await afterChange()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to write off stock"))
    } finally {
      setBusy(null)
    }
  }

  const release = async (reservation: StockReservation) => {
    setBusy(reservation.id)
    try {
      await releaseReservation(reservation.id)
      toast.success(`Released ${reservation.quantity} × ${reservation.variant_sku}`)
      await afterChange()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to release reservation"))
    } finally {
      setBusy(null)
    }
  }

  const confirmDelete = async () => {
    setBusy("delete")
    try {
      await remove()
      toast.success(`${name} deleted`)
      onDeleted()
      onClose()
    } catch (err) {
      if (isBlockedByStock(err)) {
        setRefusal(getApiErrorMessage(err, "It still has stock"))
        setHoldings(await load())
      } else {
        toast.error(getApiErrorMessage(err, `Failed to delete ${name}`))
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !working && onClose()}>
      <DialogContent
        className={cn(
          // Phones: a margin either side and tighter padding, so the rows keep their width.
          "w-[calc(100%-1.5rem)] p-4 sm:p-6",
          blocked ? "max-h-[90vh] overflow-y-auto sm:max-w-2xl" : "sm:max-w-md"
        )}
      >
        <DialogHeader>
          <DialogTitle className="px-6 sm:px-0 sm:pr-6">{blocked ? `${name} can't be deleted yet` : `Delete ${name}?`}</DialogTitle>
          <DialogDescription>
            {holdings === null
              ? "Checking stock and reservations…"
              : blocked
                ? "It still has stock on hand or units held for orders. Clear them below, then delete."
                : `Are you sure you want to delete "${name}"? This action cannot be undone.`}
          </DialogDescription>
        </DialogHeader>

        {holdings === null && (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {holdings !== null && blocked && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                ["On hand", totals.onHand],
                ["Reserved", totals.reserved],
                ["Available", totals.available],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-lg font-semibold">{value}</div>
                </div>
              ))}
            </div>

            {refusal && <p className="text-sm text-destructive">{refusal}</p>}

            {stock.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Stock</h3>
                {canAdjust && totals.available > 0 && (
                  <div className="space-y-1">
                    <Label htmlFor="delete-write-off-reason">
                      Write-off reason <span className="font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="delete-write-off-reason"
                      value={reason}
                      placeholder={DEFAULT_REASON}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>
                )}
                <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                  {stock.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-col gap-2 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-3"
                    >
                      <div className="min-w-0 sm:flex-1">
                        <div className="truncate font-medium">{item.variant_sku}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.warehouse_name} · {item.quantity_on_hand} on hand · {item.quantity_reserved} reserved ·{" "}
                          {item.available} available
                        </div>
                      </div>
                      {item.available === 0 ? (
                        <span className="text-xs text-muted-foreground">Held for orders</span>
                      ) : (
                        canAdjust && (
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              step={1}
                              min={1}
                              max={item.available}
                              aria-label={`Quantity of ${item.variant_sku} to write off`}
                              className="h-9 min-w-0 flex-1 sm:w-20 sm:flex-none"
                              value={quantities[item.id] ?? String(item.available)}
                              onChange={(e) => setQuantities((q) => ({ ...q, [item.id]: e.target.value }))}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              className="h-9 shrink-0"
                              disabled={working}
                              onClick={() => writeOff(item)}
                            >
                              {busy === item.id && <Loader2 className="animate-spin" />}
                              Write off
                            </Button>
                          </div>
                        )
                      )}
                    </li>
                  ))}
                </ul>
                {!canAdjust && (
                  <p className="text-xs text-muted-foreground">You don't have permission to adjust stock.</p>
                )}
              </section>
            )}

            {reservations.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Reserved for orders</h3>
                <p className="text-xs text-muted-foreground">
                  Releasing a reservation returns its units to available stock; the order no longer holds them.
                </p>
                <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                  {reservations.map((reservation) => (
                    <li key={reservation.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">Order {reservation.order_number}</div>
                        <div className="text-xs text-muted-foreground">
                          {reservation.quantity} × {reservation.variant_sku}
                        </div>
                      </div>
                      {canRelease && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={working}
                          onClick={() => release(reservation)}
                        >
                          {busy === reservation.id && <Loader2 className="animate-spin" />}
                          Release
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                {!canRelease && (
                  <p className="text-xs text-muted-foreground">You don't have permission to release reservations.</p>
                )}
              </section>
            )}
          </div>
        )}

        <DialogActions
          onCancel={onClose}
          onSubmit={confirmDelete}
          submitLabel="Delete"
          submitting={busy === "delete"}
          submitDisabled={holdings === null || working || !isDeletable(stock, reservations.length)}
          destructive
          icon={Trash2Icon}
        />
      </DialogContent>
    </Dialog>
  )
}
