import { useState } from "react"
import { toast } from "sonner"
import { Loader2, Package, PencilIcon, Trash2Icon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { DeleteModal } from "@/components/common/DeleteModal"
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

  const saveQuantity = async () => {
    if (!editing) return
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
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/20">
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="text-center">Shipped</TableHead>
                <TableHead className="text-center">Returned</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                {showActions && <TableHead className="w-[90px] text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
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
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{line.product_name || "—"}</p>
                        <p className="font-mono text-xs uppercase text-muted-foreground">{line.variant_sku}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-semibold">{line.quantity}</TableCell>
                  <TableCell className="text-center">{line.shipped_quantity}</TableCell>
                  <TableCell className="text-center">{line.returned_quantity}</TableCell>
                  <TableCell className="text-right">{formatCurrency(line.unit_price)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(line.discount_amount)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(line.tax_amount)}</TableCell>
                  {showActions && (
                    <TableCell className="text-right">
                      {canEditLine(line) && (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit quantity of ${line.product_name}`}
                            onClick={() => openEdit(line)}
                          >
                            <PencilIcon className="size-4" />
                          </Button>
                          {canRemoveLine(line) && (
                            <DeleteModal
                              title={`Remove ${line.product_name}?`}
                              description="The line is dropped, its held stock is released and totals are recalculated."
                              onConfirm={() => removeLine(line)}
                              trigger={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive"
                                  aria-label={`Remove ${line.product_name}`}
                                >
                                  <Trash2Icon className="size-4" />
                                </Button>
                              }
                            />
                          )}
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit quantity</DialogTitle>
            <DialogDescription>{editing?.product_name}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="line-quantity">Quantity</FieldLabel>
            <FieldContent>
              <Input
                id="line-quantity"
                type="number"
                min={1}
                step={1}
                value={quantity}
                aria-invalid={!qtyValid}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </FieldContent>
          </Field>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveQuantity} disabled={!qtyValid || busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
