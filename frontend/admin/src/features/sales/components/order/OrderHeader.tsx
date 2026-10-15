import { useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { FileText, PencilIcon, ShieldAlert, Trash2 } from "lucide-react"

import { useAppDispatch } from "@/app/hooks"
import { deleteData } from "@/features/sales/slices/orderSlice"
import { KIND_PATHS, orderNoun } from "@/features/sales/shared/kindPaths"
import type { Order } from "@/features/sales/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { SubmitButton } from "@/components/common/FormActions"
import { PageHeader } from "@/components/common/PageHeader"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useCan } from "@/hooks/use-can"
import { useLastValue } from "@/hooks/use-dialog-presence"
import { api, getApiErrorMessage } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import { downloadFile } from "@/lib/download"
import { formatDateTime, humanize } from "@/lib/format"
import { OrderActions } from "./OrderActions"
import { OrderEditDialog } from "./OrderEditDialog"

/** POST /admin/risk/orders/{id}/assess/ — a fresh risk assessment of one order. */
interface RiskAssessment {
  risk_level: string
  risk_score: string
  risk_reasons: string[]
  recommended_action: string
  auto_blocked: boolean
  guidance: string
}

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

  const [risk, setRisk] = useState<RiskAssessment | null>(null)
  const riskShown = useLastValue(risk)
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
      const res = await api.post(`/admin/risk/orders/${order.id}/assess/`)
      setRisk(unwrapItem<RiskAssessment>(res.data))
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

      <Dialog open={!!risk} onOpenChange={(open) => !open && setRisk(null)}>
        {riskShown && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                Risk check
                <StatusBadge
                  status={riskShown.risk_level}
                  tone={riskShown.risk_level === "low" ? "success" : riskShown.risk_level === "high" ? "destructive" : "warning"}
                />
              </DialogTitle>
              <DialogDescription>{riskShown.guidance}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p>
                Score <span className="font-semibold tabular-nums">{riskShown.risk_score}</span> · recommended:{" "}
                <span className="font-medium">{humanize(riskShown.recommended_action)}</span>
                {riskShown.auto_blocked && " · automatically blocked"}
              </p>
              {riskShown.risk_reasons.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  {riskShown.risk_reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No risk signals found.</p>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
