import { useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { FileText, PencilIcon, ShieldAlert, Trash2 } from "lucide-react"

import { useAppDispatch } from "@/app/hooks"
import { deleteData } from "@/features/sales/slices/orderSlice"
import { KIND_PATHS, orderNoun } from "@/features/sales/shared/kindPaths"
import type { Order } from "@/features/sales/types"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { PageHeader } from "@/components/common/PageHeader"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useCan } from "@/hooks/use-can"
import { api, getApiErrorMessage } from "@/lib/api/client"
import { downloadFile } from "@/lib/download"
import { formatDateTime } from "@/lib/format"
import { OrderActions, type OrderMenuItem } from "./OrderActions"
import { OrderEditDialog } from "./OrderEditDialog"

const DELETE_WARNING = {
  stock:
    "This permanently removes the order together with its payments, shipments and returns, and releases any stock it holds. It can't be undone. To keep the record, cancel the order instead.",
  preorder:
    "This permanently removes the pre-order together with its payments, shipments and returns. It can't be undone. To keep the record, cancel the pre-order instead.",
}

/** Title, back link and the order's buttons; invoice, risk check, edit and delete join its "More actions" menu. */
export function OrderHeader({ order, refresh, badges }: { order: Order; refresh: () => void; badges?: ReactNode }) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const canManage = useCan("orders.manage")
  const canAssessRisk = useCan("risk.manage")

  const kind = order.order_type
  const noun = orderNoun(kind)

  const [checking, setChecking] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    try {
      await dispatch(deleteData(order.id)).unwrap()
      toast.success(`${kind === "preorder" ? "Pre-order" : "Order"} ${order.order_number} deleted`)
      navigate(KIND_PATHS[kind].orders)
    } catch (err) {
      toast.error(getApiErrorMessage(err, `Failed to delete ${noun}`))
    }
  }

  const handleRiskCheck = async () => {
    setChecking(true)
    try {
      await api.post(`/admin/risk/orders/${order.id}/assess/`)
      refresh()
      toast.success("Risk check complete")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Risk check failed"))
    } finally {
      setChecking(false)
    }
  }

  const handleInvoice = async () => {
    setDownloading(true)
    try {
      await downloadFile(`/admin/orders/${order.id}/invoice/`, `invoice-${order.order_number}.pdf`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to download invoice"))
    } finally {
      setDownloading(false)
    }
  }

  const menuItems: OrderMenuItem[] = [
    {
      label: downloading ? "Preparing invoice…" : "Invoice PDF",
      icon: FileText,
      onSelect: handleInvoice,
      disabled: downloading,
    },
    ...(canAssessRisk
      ? [{ label: checking ? "Checking risk…" : "Check risk", icon: ShieldAlert, onSelect: handleRiskCheck, disabled: checking }]
      : []),
    ...(canManage ? [{ label: "Edit details", icon: PencilIcon, onSelect: () => setEditing(true) }] : []),
    ...(canManage ? [{ label: `Delete ${noun}`, icon: Trash2, onSelect: () => setDeleting(true), destructive: true }] : []),
  ]

  return (
    <>
      <PageHeader
        back={{
          to: KIND_PATHS[kind].orders,
          label: kind === "preorder" ? "Back to pre-orders" : "Back to orders",
        }}
        title={order.order_number}
        badges={
          <>
            <StatusBadge status={order.status} />
            {badges}
          </>
        }
        description={`Placed on ${formatDateTime(order.created_at)}`}
        actions={<OrderActions order={order} refresh={refresh} menuItems={menuItems} />}
      />

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        destructive
        icon={<Trash2 />}
        title={`Delete ${noun} ${order.order_number}?`}
        description={DELETE_WARNING[kind]}
        confirmLabel={`Delete ${noun}`}
        cancelLabel={`Keep ${noun}`}
        onConfirm={handleDelete}
      />

      <OrderEditDialog order={order} open={editing} onOpenChange={setEditing} />
    </>
  )
}
