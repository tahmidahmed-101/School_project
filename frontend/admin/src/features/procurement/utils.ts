import { toast } from "sonner"
import { api, extractApiError, getApiErrorMessage } from "@/lib/api/client"
import type { StatusTone } from "@/components/common/status-tones"
import type { PurchaseOrder, VariantOption } from "./types"

export const PO_STATUS_TONE: Record<string, StatusTone> = {
  draft: "secondary",
  submitted: "info",
  received: "success",
  cancelled: "destructive",
}

export const GRN_STATUS_TONE: Record<string, StatusTone> = {
  pending: "warning",
  qc_pass: "success",
  qc_reject: "destructive",
}

export const GRN_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  qc_pass: "QC pass",
  qc_reject: "QC reject",
}

export const BILL_STATUS_TONE: Record<string, StatusTone> = {
  unpaid: "warning",
  paid: "success",
  overdue: "destructive",
  void: "secondary",
}

const round2 = (n: number) => Math.round(n * 100) / 100

export const poOrderedTotal = (po: PurchaseOrder) =>
  round2(po.lines.reduce((s, l) => s + Number(l.unit_cost) * l.quantity_ordered, 0))

/** Value of what has actually been received — what a vendor bill must match (3-way match). */
export const poReceivedTotal = (po: PurchaseOrder) =>
  round2(po.lines.reduce((s, l) => s + Number(l.unit_cost) * l.quantity_received, 0))

export const poUnitsOrdered = (po: PurchaseOrder) => po.lines.reduce((s, l) => s + l.quantity_ordered, 0)
export const poUnitsReceived = (po: PurchaseOrder) => po.lines.reduce((s, l) => s + l.quantity_received, 0)

/** Fetches a backend-rendered PDF with auth and opens it in a new tab. */
export async function openPdf(url: string) {
  try {
    const res = await api.get(url, { responseType: "blob" })
    const objectUrl = URL.createObjectURL(res.data as Blob)
    window.open(objectUrl, "_blank", "noopener")
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  } catch (err) {
    toast.error(getApiErrorMessage(extractApiError(err), "Couldn't load the PDF"))
  }
}

export const variantLabel = (v: Pick<VariantOption, "product_name" | "color" | "size">) =>
  [v.product_name, [v.color, v.size].filter(Boolean).join(" / ")].filter(Boolean).join(" — ")
