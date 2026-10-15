import { useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { FileText, PencilIcon, ShieldAlert, Trash2 } from "lucide-react"

import { useAppDispatch } from "@/app/hooks"
import { deleteData } from "@/features/sales/slices/orderSlice"
import { KIND_PATHS, orderNoun } from "@/features/sales/shared/kindPaths"
import type { Order } from "@/features/sales/types"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { SubmitButton } from "@/components/common/FormActions"
import { PageHeader } from "@/components/common/PageHeader"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useCan } from "@/hooks/use-can"
import { api, getApiErrorMessage } from "@/lib/api/client"
import { downloadFile } from "@/lib/download"
import { formatDateTime } from "@/lib/format"
import { OrderActions } from "./OrderActions"
import { OrderEditDialog } from "./OrderEditDialog"

const DELETE_WARNING = {
  stock:
    "This permanently removes the order together with its payments, shipments and returns, and releases any stock it holds. It can't be undone. To keep the record, cancel the order instead.",
  preorder:
    "This permanently removes the pre-order together with its payments, shipments and returns. It can't be undone. To keep the record, cancel the pre-order instead.",
}

/** Title, back link and the buttons every order has: invoice, risk check, edit, delete. */
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
        actions={
          <>
            <OrderActions order={order} refresh={refresh} />
            <SubmitButton type="button" loading={downloading} icon={FileText} variant="outline" onClick={handleInvoice}>
              Invoice PDF
            </SubmitButton>
            {canAssessRisk && (
              <Button variant="outline" onClick={handleRiskCheck} disabled={checking}>
                <ShieldAlert className="size-4" />
                Check risk
              </Button>
            )}
            {canManage && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <PencilIcon className="size-4" />
                Edit details
              </Button>
            )}
            {canManage && (
              <ConfirmDialog
                destructive
                icon={<Trash2 />}
                title={`Delete ${noun} ${order.order_number}?`}
                description={DELETE_WARNING[kind]}
                confirmLabel={`Delete ${noun}`}
                cancelLabel={`Keep ${noun}`}
                onConfirm={handleDelete}
                trigger={
                  <Button variant="destructive">
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                }
              />
            )}
          </>
        }
      />

      <OrderEditDialog order={order} open={editing} onOpenChange={setEditing} />
    </>
  )
}
