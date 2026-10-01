import { useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { useAppDispatch } from "@/app/hooks"
import { createReturn } from "@/features/sales/slices/orderSlice"
import type { Order, OrderLine } from "@/features/sales/types"
import { lineQuantitiesValid, toLinePayload } from "@/features/sales/shared/lineQuantities"
import { getApiErrorMessage } from "@/lib/api/client"
import { LineQuantityTable } from "./LineQuantityTable"

const returnable = (line: OrderLine) => line.returnable_quantity

interface CreateReturnDialogProps {
  order: Order
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (rmaId: string) => void
}

/** Staff-initiated RMA against shipped, not-yet-claimed units. */
function CreateReturnDialogForm({ order, onOpenChange, onCreated }: Omit<CreateReturnDialogProps, "open">) {
  const dispatch = useAppDispatch()
  const [reason, setReason] = useState("")
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const lines = order.lines.filter((l) => l.shipped_quantity > 0)
  const valid = lineQuantitiesValid(lines, quantities, returnable)

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const rma = await dispatch(
        createReturn({ orderId: order.id, payload: { reason: reason.trim(), lines: toLinePayload(quantities) } })
      ).unwrap()
      toast.success(`Return ${rma.rma_number} opened`)
      onOpenChange(false)
      onCreated(rma.id)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to create return"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle>Create return (RMA)</DialogTitle>
          <DialogDescription>
            Only shipped units that aren't already claimed by another return can be returned.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <LineQuantityTable
            lines={lines}
            maxFor={returnable}
            maxLabel="Returnable"
            values={quantities}
            onChange={setQuantities}
          />
          <Field>
            <FieldLabel htmlFor="rma-reason">Reason</FieldLabel>
            <FieldContent>
              <Textarea
                id="rma-reason"
                rows={3}
                placeholder="e.g. Wrong size delivered"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </FieldContent>
          </Field>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!valid || submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Create return
          </Button>
        </DialogFooter>
    </>
  )
}

export function CreateReturnDialog({ open, onOpenChange, ...props }: CreateReturnDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {open && <CreateReturnDialogForm onOpenChange={onOpenChange} {...props} />}
      </DialogContent>
    </Dialog>
  )
}
