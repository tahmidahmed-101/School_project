import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { addDays, format } from "date-fns"
import { toast } from "sonner"
import { CheckCircle2, FileText, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { api, getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import { formatCurrency } from "@/lib/format"
import { useAppDispatch } from "@/app/hooks"

import { createVendorBill, updateVendorBill } from "../slices/vendorBillSlice"
import type { PurchaseOrder, VendorBill } from "../types"
import { useAllPages } from "../hooks/useProcurement"
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
  const pickMode = !bill && !purchaseOrder
  const { items: allPos, isLoading: posLoading } = useAllPages<PurchaseOrder>(
    "/admin/procurement/purchase-orders/",
    undefined,
    open && pickMode
  )
  const billablePos = useMemo(
    () => allPos.filter((p) => p.status !== "draft" && p.lines.some((l) => l.quantity_received > 0)),
    [allPos]
  )
  const [picked, setPicked] = useState<PurchaseOrder | null>(null)
  const po = purchaseOrder ?? picked

  const handleOpenChange = (next: boolean) => {
    if (!next) setPicked(null)
    onOpenChange(next)
  }

  const handlePick = async (id: string) => {
    try {
      const res = await api.get(`/admin/procurement/purchase-orders/${id}/`)
      setPicked(unwrapItem<PurchaseOrder>(res.data))
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't load that purchase order"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {bill ? `Edit ${bill.bill_number}` : "New Vendor Bill"}
          </DialogTitle>
          <DialogDescription>
            {bill
              ? "Changing the amount or due date re-posts the bill to the ledger."
              : "Posting a bill moves the PO's received value from Goods Received Not Invoiced to Accounts Payable."}
          </DialogDescription>
        </DialogHeader>

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

        {open && (
          <BillForm
            key={bill?.id ?? po?.id ?? "none"}
            po={po}
            bill={bill ?? null}
            onCancel={() => handleOpenChange(false)}
            onSaved={(saved) => {
              onSaved?.(saved)
              handleOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function BillForm({
  po,
  bill,
  onCancel,
  onSaved,
}: {
  po: PurchaseOrder | null
  bill: VendorBill | null
  onCancel: () => void
  onSaved: (bill: VendorBill) => void
}) {
  const dispatch = useAppDispatch()
  const expected = po ? poReceivedTotal(po) : null
  const {
    register,
    setError,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: bill ? Number(bill.amount).toFixed(2) : expected !== null ? expected.toFixed(2) : "",
      due_date: bill?.due_date ?? format(addDays(new Date(), 30), "yyyy-MM-dd"),
    },
  })

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
      onSaved(saved)
    } catch (err) {
      for (const [field, message] of Object.entries(getApiFieldErrors(err))) {
        if (field === "amount" || field === "due_date") setError(field, { message })
      }
      toast.error(getApiErrorMessage(err, "Failed to save bill"))
    }
  }

  return (
    <>
      <form id="bill-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 py-2">
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
          <Field>
            <FieldLabel htmlFor="bill-amount">Amount (BDT) *</FieldLabel>
            <FieldContent>
              <Input id="bill-amount" type="number" step="0.01" min="0.01" aria-invalid={!!errors.amount} {...register("amount")} />
              <FieldDescription>Must match the received value (3-way match).</FieldDescription>
              <FieldError errors={[errors.amount]} />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="bill-due">Due date *</FieldLabel>
            <FieldContent>
              <Input id="bill-due" type="date" aria-invalid={!!errors.due_date} {...register("due_date")} />
              <FieldError errors={[errors.due_date]} />
            </FieldContent>
          </Field>
        </div>
      </form>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" form="bill-form" disabled={isSubmitting || (!bill && !po)}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          {bill ? "Save Changes" : "Post Bill"}
        </Button>
      </DialogFooter>
    </>
  )
}
