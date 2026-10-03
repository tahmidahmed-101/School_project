import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { FormDialog } from "@/components/common/FormDialog"
import { TextareaField } from "@/components/common/form-fields"
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
export function CreateReturnDialog({ order, open, onOpenChange, onCreated }: CreateReturnDialogProps) {
  const dispatch = useAppDispatch()
  const [reason, setReason] = useState("")
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // Start from a clean form each time the dialog opens.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setReason("")
      setQuantities({})
    }
  }

  const lines = order.lines.filter((l) => l.shipped_quantity > 0)
  const valid = lineQuantitiesValid(lines, quantities, returnable)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create return (RMA)"
      description="Only shipped units that aren't already claimed by another return can be returned."
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Create return"
      submitDisabled={!valid}
      size="lg"
    >
      <LineQuantityTable
        lines={lines}
        maxFor={returnable}
        maxLabel="Returnable"
        values={quantities}
        onChange={setQuantities}
      />
      <TextareaField
        label="Reason"
        id="rma-reason"
        rows={3}
        placeholder="e.g. Wrong size delivered"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
    </FormDialog>
  )
}
