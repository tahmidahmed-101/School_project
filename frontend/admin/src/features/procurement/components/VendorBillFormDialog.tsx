import { useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { addDays, format } from "date-fns"
import { toast } from "sonner"
import { FileText } from "lucide-react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { FormDialog } from "@/components/common/FormDialog"
import { DateField, TextField } from "@/components/common/form-fields"
import { formatCurrency, getDefaultCurrency } from "@/lib/format"
import { reportFormError } from "@/lib/forms"
import { useAppDispatch } from "@/app/hooks"
import { useAllPages } from "@/hooks/use-all-pages"

import { createVendorBill, updateVendorBill } from "../slices/vendorBillSlice"
import type { PurchaseOrder, VendorBill } from "../types"
import { usePurchaseOrderPick } from "../hooks/usePurchaseOrderPick"
import { poReceivedTotal } from "../utils"

const schema = z.object({
  amount: z.string().refine((v) => v !== "" && Number(v) > 0 && /^\d+(\.\d{1,2})?$/.test(v), "Enter an amount (max 2 decimals)"),
  due_date: z.string().min(1, "Pick a due date"),
})
type FormValues = z.infer<typeof schema>

/**
 * Create a vendor bill against a PO (amount must equal the value received — the backend's
 * 3-way match), or edit an open bill's amount / due date.
 */
export function VendorBillFormDialog({
  open,
  onOpenChange,
  purchaseOrder,
  bill,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Preset PO for create mode (from the PO detail page). */
  purchaseOrder?: PurchaseOrder | null
  /** Bill to edit; omit for create. */
  bill?: VendorBill | null
  onSaved?: (bill: VendorBill) => void
}) {
  const dispatch = useAppDispatch()
  const pickMode = !bill && !purchaseOrder
  const { items: allPos, isLoading: posLoading } = useAllPages<PurchaseOrder>(
    "/admin/procurement/purchase-orders/",
    undefined,
    { enabled: open && pickMode }
  )
  const billablePos = useMemo(
    () => allPos.filter((p) => p.status !== "draft" && p.lines.some((l) => l.quantity_received > 0)),
    [allPos]
  )
  const { picked, handleOpenChange, handlePick } = usePurchaseOrderPick(onOpenChange)
  const po = purchaseOrder ?? picked
  const expected = po ? poReceivedTotal(po) : null

  const {
    register,
    reset,
    setError,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  // Re-seed on open and whenever the bill or picked PO changes (the amount defaults to the received value).
  useEffect(() => {
    if (!open) return
    reset({
      amount: bill ? Number(bill.amount).toFixed(2) : expected !== null ? expected.toFixed(2) : "",
      due_date: bill?.due_date ?? format(addDays(new Date(), 30), "yyyy-MM-dd"),
    })
  }, [open, bill, expected, reset])

  const onSubmit = async (values: FormValues) => {
    try {
      let saved: VendorBill
      if (bill) {
        saved = await dispatch(updateVendorBill({ id: bill.id, payload: values })).unwrap()
        toast.success("Bill updated")
      } else {
        if (!po) return
        saved = await dispatch(
          createVendorBill({
            purchase_order_id: po.id,
            supplier_id: po.supplier_id,
            amount: values.amount,
            due_date: values.due_date,
          })
        ).unwrap()
        toast.success(`${saved.bill_number} posted`)
      }
      onSaved?.(saved)
      handleOpenChange(false)
    } catch (err) {
      reportFormError(err, { setError, fields: ["amount", "due_date"], fallback: "Failed to save bill" })
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={
        <span className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          {bill ? `Edit ${bill.bill_number}` : "New Vendor Bill"}
        </span>
      }
      description={
        bill
          ? "Changing the amount or due date re-posts the bill to the ledger."
          : "Posting a bill moves the PO's received value from Goods Received Not Invoiced to Accounts Payable."
      }
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={bill ? "Save Changes" : "Post Bill"}
      submitDisabled={!bill && !po}
    >
      {pickMode && (
        <Field>
          <FieldLabel htmlFor="bill-po">Purchase order *</FieldLabel>
          <FieldContent>
            <Select value={picked?.id ?? ""} onValueChange={handlePick}>
              <SelectTrigger id="bill-po">
                <SelectValue placeholder={posLoading ? "Loading..." : "Select a PO with received goods"} />
              </SelectTrigger>
              <SelectContent>
                {billablePos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.po_number} · {p.supplier_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>
      )}
      {po && !bill && (
        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <p>
            Supplier: <span className="font-medium">{po.supplier_name}</span>
          </p>
          <p>
            Received value: <span className="font-semibold">{formatCurrency(expected)}</span>
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField
          label={`Amount (${getDefaultCurrency()}) *`}
          id="bill-amount"
          type="number"
          step="0.01"
          min="0.01"
          description="Must match the received value (3-way match)."
          error={errors.amount}
          {...register("amount")}
        />
        <DateField label="Due date *" id="bill-due" error={errors.due_date} {...register("due_date")} />
      </div>
    </FormDialog>
  )
}
