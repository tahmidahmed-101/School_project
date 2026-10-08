import { useEffect, useState } from "react"
import { useKind } from "@/hooks/use-kind"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { PackageCheck } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ProductCell } from "@/components/common/cells"
import { DataTable } from "@/components/common/data-table"
import { DialogActions } from "@/components/common/FormDialog"
import { useAppDispatch } from "@/app/hooks"
import { receiveBackShipment } from "@/features/shipping/slices/shipmentSlice"
import type { Shipment, ShipmentLine } from "@/features/shipping/types"
import { api, getApiErrorMessage } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"

interface ReceiveBackDialogProps {
  shipment: Shipment
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after the consignment is booked back in. */
  onDone?: () => void
}

/** A whole number of damaged units between 0 and what the line carried; empty counts as 0. */
function damagedOf(raw: string | undefined, max: number): number | null {
  if (raw === undefined || raw === "") return 0
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null
}

/**
 * Books a returned or cancelled consignment as physically back. Staff state how many units of
 * each line came back damaged; the rest are sellable, so the two always add up to what shipped.
 */
export function ReceiveBackDialog({ shipment, open, onOpenChange, onDone }: ReceiveBackDialogProps) {
  const dispatch = useAppDispatch()
  const pageKind = useKind()
  const isPreorder = (shipment.order_type ?? pageKind) === "preorder"
  // Lists and the order page carry shipments without their lines, so they are loaded on open.
  const [lines, setLines] = useState<ShipmentLine[] | null>(shipment.lines ?? null)
  const [loadError, setLoadError] = useState("")
  const [damaged, setDamaged] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || lines) return
    let cancelled = false
    api
      .get(`/admin/orders/shipments/${shipment.id}/`)
      .then((res) => {
        if (!cancelled) setLines(unwrapItem<Shipment>(res.data).lines ?? [])
      })
      .catch((err) => {
        if (!cancelled) setLoadError(getApiErrorMessage(err, "Couldn't load this shipment's items"))
      })
    return () => {
      cancelled = true
    }
  }, [open, lines, shipment.id])

  const splits = (lines ?? []).map((line) => ({ line, damaged: damagedOf(damaged[line.id], line.quantity) }))
  const valid = splits.length > 0 && splits.every((s) => s.damaged !== null)
  const totalDamaged = splits.reduce((sum, s) => sum + (s.damaged ?? 0), 0)

  const handleSubmit = async () => {
    if (!valid) return
    setBusy(true)
    try {
      await dispatch(
        receiveBackShipment({
          id: shipment.id,
          lines: splits.map(({ line, damaged: count }) => ({
            shipment_line_id: line.id,
            sellable_quantity: line.quantity - (count ?? 0),
            damaged_quantity: count ?? 0,
          })),
        })
      ).unwrap()
      toast.success(
        totalDamaged > 0
          ? `Consignment received back — ${totalDamaged} damaged unit${totalDamaged === 1 ? "" : "s"} written off`
          : isPreorder
            ? "Consignment received back — the units are set aside for this pre-order again"
            : "Consignment received back and restocked"
      )
      onOpenChange(false)
      setDamaged({})
      onDone?.()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to receive the consignment back"))
    } finally {
      setBusy(false)
    }
  }

  const columns: ColumnDef<ShipmentLine>[] = [
    {
      id: "product",
      header: "Product",
      cell: ({ row }) => <ProductCell name={row.original.product_name} sku={row.original.sku} />,
    },
    {
      id: "shipped",
      header: "Shipped",
      meta: { align: "center" },
      cell: ({ row }) => <span className="text-sm">{row.original.quantity}</span>,
    },
    {
      id: "damaged",
      header: "Damaged",
      meta: { align: "right" },
      cell: ({ row: { original: line } }) => (
        <Input
          type="number"
          min={0}
          max={line.quantity}
          step={1}
          placeholder="0"
          aria-label={`Damaged units of ${line.product_name}`}
          aria-invalid={damagedOf(damaged[line.id], line.quantity) === null}
          className="h-8 text-right"
          value={damaged[line.id] ?? ""}
          onChange={(e) => setDamaged({ ...damaged, [line.id]: e.target.value })}
        />
      ),
    },
    {
      id: "sellable",
      header: "Sellable",
      meta: { align: "center" },
      cell: ({ row: { original: line } }) => {
        const count = damagedOf(damaged[line.id], line.quantity)
        return <span className="text-sm font-medium">{count === null ? "—" : line.quantity - count}</span>
      },
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Receive consignment back</DialogTitle>
          <DialogDescription>
            Enter how many units of each item came back damaged.{" "}
            {isPreorder
              ? "Sellable units count as arrived again and are set aside for this pre-order so they can be shipped again."
              : "Sellable units go back into stock and are held for this order so they can be shipped again."}{" "}
            Damaged units are written off and stay owed to the customer until you replace them. No payment is refunded
            here.
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : lines === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading items…</p>
        ) : (
          <DataTable
            surface="card"
            showPagination={false}
            selectable={false}
            columns={columns}
            data={lines}
            minWidth="0px"
            columnWidths={["auto", "90px", "110px", "90px"]}
          />
        )}

        <DialogActions
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
          submitLabel="Receive back"
          icon={PackageCheck}
          submitting={busy}
          submitDisabled={!valid}
        />
      </DialogContent>
    </Dialog>
  )
}
