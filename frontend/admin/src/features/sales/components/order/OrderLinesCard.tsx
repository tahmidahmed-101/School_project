import type { ColumnDef } from "@tanstack/react-table"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Package } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { DataTable } from "@/components/common/data-table"
import { FormDialog } from "@/components/common/FormDialog"
import { ProductCell } from "@/components/common/cells"
import { TextField } from "@/components/common/form-fields"
import { TableActions } from "@/components/common/TableActions"
import { useAppDispatch } from "@/app/hooks"
import { removeOrderLine, updateOrderLine } from "@/features/sales/slices/orderSlice"
import { PRE_SHIPMENT_STATUSES, type Order, type OrderLine } from "@/features/sales/types"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency } from "@/lib/format"

interface OrderLinesCardProps {
  order: Order
  canManage: boolean
}

export function OrderLinesCard({ order, canManage }: OrderLinesCardProps) {
  const dispatch = useAppDispatch()
  const [editing, setEditing] = useState<OrderLine | null>(null)
  const [quantity, setQuantity] = useState("")
  const [busy, setBusy] = useState(false)

  // services/orders.py: lines are editable only before anything ships, and never once a
  // line has shipped in part; the last line can't be removed (cancel the order instead).
  const linesEditable = canManage && PRE_SHIPMENT_STATUSES.includes(order.status)
  const canEditLine = (line: OrderLine) => linesEditable && line.shipped_quantity === 0
  const canRemoveLine = (line: OrderLine) => canEditLine(line) && order.lines.length > 1
  const showActions = order.lines.some(canEditLine)

  const openEdit = (line: OrderLine) => {
    setEditing(line)
    setQuantity(String(line.quantity))
  }

  const saveQuantity = async (e: FormEvent) => {
    e.preventDefault()
    if (!editing || !qtyValid) return
    setBusy(true)
    try {
      await dispatch(updateOrderLine({ orderId: order.id, lineId: editing.id, quantity: Number(quantity) })).unwrap()
      toast.success("Line quantity updated")
      setEditing(null)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to update line"))
    } finally {
      setBusy(false)
    }
  }

  const removeLine = async (line: OrderLine) => {
    try {
      await dispatch(removeOrderLine({ orderId: order.id, lineId: line.id })).unwrap()
      toast.success(`${line.product_name} removed from the order`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to remove line"))
    }
  }

  const qtyValid = Number.isInteger(Number(quantity)) && Number(quantity) >= 1

  const columns: ColumnDef<OrderLine>[] = [
    {
      id: "product",
      header: "Product",
      cell: ({ row: { original: line } }) => (
        <div className="flex items-center gap-3">
          {line.product_image ? (
            <img
              src={line.product_image}
              alt=""
              className="h-10 w-10 shrink-0 rounded-md border object-cover"
              loading="lazy"
            />
          ) : (
            <div className="h-10 w-10 shrink-0 rounded-md border bg-muted" />
          )}
          <ProductCell name={line.product_name || "—"} sku={line.variant_sku} />
        </div>
      ),
    },
    {
      id: "qty",
      header: "Qty",
      meta: { align: "center" },
      cell: ({ row }) => <span className="font-semibold">{row.original.quantity}</span>,
    },
    { id: "shipped", header: "Shipped", meta: { align: "center" }, cell: ({ row }) => row.original.shipped_quantity },
    { id: "returned", header: "Returned", meta: { align: "center" }, cell: ({ row }) => row.original.returned_quantity },
    {
      id: "unit_price",
      header: "Unit price",
      meta: { align: "right" },
      cell: ({ row }) => formatCurrency(row.original.unit_price),
    },
    {
      id: "discount",
      header: "Discount",
      meta: { align: "right" },
      cell: ({ row }) => formatCurrency(row.original.discount_amount),
    },
    { id: "tax", header: "Tax", meta: { align: "right" }, cell: ({ row }) => formatCurrency(row.original.tax_amount) },
    ...(showActions
      ? [
          {
            id: "actions",
            header: "Actions",
            cell: ({ row: { original: line } }) =>
              canEditLine(line) ? (
                <TableActions
                  itemName={line.product_name}
                  onEdit={() => openEdit(line)}
                  onDelete={canRemoveLine(line) ? () => removeLine(line) : undefined}
                />
              ) : null,
          } satisfies ColumnDef<OrderLine>,
        ]
      : []),
  ]

  return (
    <Card className="shadow-sm overflow-hidden">
      <CardHeader className="border-b bg-muted/30">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          Order lines ({order.lines.length})
        </CardTitle>
        {linesEditable && (
          <CardDescription>Quantities can be corrected until the order ships; stock holds follow.</CardDescription>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <DataTable
          embedded
          showPagination={false}
          columns={columns}
          data={order.lines}
          minWidth="820px"
          columnWidths={["auto", "70px", "90px", "90px", "120px", "110px", "100px", ...(showActions ? ["80px"] : [])]}
          unlabelledColumns={["actions"]}
        />
      </CardContent>

      <FormDialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit quantity"
        description={editing?.product_name}
        onSubmit={saveQuantity}
        submitting={busy}
        submitLabel="Save"
        submitDisabled={!qtyValid}
      >
        <TextField
          label="Quantity"
          id="line-quantity"
          type="number"
          min={1}
          step={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </FormDialog>
    </Card>
  )
}
