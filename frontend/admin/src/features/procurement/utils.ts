import { toast } from "sonner"
import { extractApiError, getApiErrorMessage } from "@/lib/api/client"
import { openFileInTab } from "@/lib/download"
import { withStatusTones } from "@/components/common/status-tones"
import type { PurchaseOrder } from "./types"

export const PO_STATUS_TONE = withStatusTones({
  submitted: "info",
  received: "success",
})

export const GRN_STATUS_TONE = withStatusTones({
  qc_pass: "success",
  qc_reject: "destructive",
})

export const GRN_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  qc_pass: "QC pass",
  qc_reject: "QC reject",
}

const round2 = (n: number) => Math.round(n * 100) / 100

export const poOrderedTotal = (po: PurchaseOrder) =>
  round2(po.lines.reduce((s, l) => s + Number(l.unit_cost) * l.quantity_ordered, 0))

/** Value of what has actually been received — what a vendor bill must match (3-way match). */
export const poReceivedTotal = (po: PurchaseOrder) =>
  round2(po.lines.reduce((s, l) => s + Number(l.unit_cost) * l.quantity_received, 0))

export const poUnitsOrdered = (po: PurchaseOrder) => po.lines.reduce((s, l) => s + l.quantity_ordered, 0)
export const poUnitsReceived = (po: PurchaseOrder) => po.lines.reduce((s, l) => s + l.quantity_received, 0)

/** Opens a backend-rendered PDF in a new tab, toasting on failure. */
export const openPdf = (url: string) =>
  openFileInTab(url).catch((err) => toast.error(getApiErrorMessage(extractApiError(err), "Couldn't load the PDF")))
