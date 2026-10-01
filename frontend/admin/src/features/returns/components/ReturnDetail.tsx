import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, Check, PackageCheck, RotateCcw, X } from "lucide-react"

import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchReturn, gradeReturnLine, runReturnAction, type RmaAction } from "@/features/returns/slices/returnSlice"
import type { Rma, RmaCondition, RmaLine } from "@/features/returns/types"
import { fetchOrderById } from "@/features/sales/slices/orderSlice"
import type { Order, OrderLine } from "@/features/sales/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DetailPageState } from "@/components/common/DetailPageState"
import { StatusBadge } from "@/components/common/StatusBadge"
import { ConfirmAction } from "@/features/sales/shared/ConfirmAction"
import { useCan } from "@/features/sales/shared/useCan"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { resolveDetailState } from "@/lib/detailState"

const ACTION_COPY: Record<RmaAction, { done: string; failed: string }> = {
  approve: { done: "Return approved", failed: "Failed to approve return" },
  reject: { done: "Return rejected", failed: "Failed to reject return" },
  receive: { done: "Return received", failed: "Failed to receive return" },
}

const ReturnDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = useCan("returns.manage")

  const { singleData, singleStatus, singleError } = useAppSelector((state) => state.returns)
  const rma = singleData && (singleData as Rma).id === id ? (singleData as Rma) : null

  useDocumentTitle(rma ? `${rma.rma_number} — Return` : "Return Details")

  // The RMA only carries order_line ids; the order supplies product names and SKUs.
  const [order, setOrder] = useState<Order | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => (id ? dispatch(fetchReturn(id)) : undefined), [dispatch, id])
  useEffect(() => {
    const request = load()
    return () => request?.abort()
  }, [load])

  const orderId = rma?.order_id
  useEffect(() => {
    if (!orderId) return
    const request = dispatch(fetchOrderById(orderId))
    request
      .unwrap()
      .then(setOrder)
      .catch(() => setOrder(null))
    return () => request.abort()
  }, [dispatch, orderId])

  const pageState = resolveDetailState(singleStatus, singleError, !!rma)
  if (pageState || !rma) {
    return (
      <DetailPageState
        state={pageState ?? "loading"}
        entity="Return"
        backTo="/returns"
        backLabel="Back to Returns"
        error={singleError}
        onRetry={() => {
          load()
        }}
      />
    )
  }

  const orderLines = new Map<string, OrderLine>((order?.lines ?? []).map((l) => [l.id, l]))

  const act = async (action: RmaAction) => {
    setBusy(true)
    try {
      await dispatch(runReturnAction({ id: rma.id, action })).unwrap()
      toast.success(ACTION_COPY[action].done)
    } catch (err) {
      toast.error(getApiErrorMessage(err, ACTION_COPY[action].failed))
    } finally {
      setBusy(false)
    }
  }

  const grade = async (line: RmaLine, condition: Exclude<RmaCondition, "">) => {
    setBusy(true)
    try {
      await dispatch(gradeReturnLine({ lineId: line.id, condition })).unwrap()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to grade line"))
    } finally {
      setBusy(false)
    }
  }

  const isRequested = rma.status === "requested"
  const isApproved = rma.status === "approved"
  const allGraded = rma.lines.every((l) => l.condition)

  return (
    <div className="section-container space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="back" size="icon" onClick={() => navigate("/returns")} aria-label="Back to returns">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{rma.rma_number}</h1>
              <StatusBadge status={rma.status} />
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">
              Return for{" "}
              <Link to={`/order_detail/${rma.order_id}`} className="text-primary hover:underline">
                {order?.order_number ?? "order"}
              </Link>
            </p>
          </div>
        </div>

        {canManage && (
          <div className="flex flex-wrap gap-2">
            {isRequested && (
              <>
                <ConfirmAction
                  title="Approve this return?"
                  description="The customer can send the items back. Grade each line when it arrives."
                  confirmLabel="Approve"
                  onConfirm={() => act("approve")}
                  trigger={
                    <Button disabled={busy}>
                      <Check className="size-4" />
                      Approve
                    </Button>
                  }
                />
                <ConfirmAction
                  destructive
                  title="Reject this return?"
                  description="The claimed units become returnable again under a later return."
                  confirmLabel="Reject"
                  onConfirm={() => act("reject")}
                  trigger={
                    <Button variant="outline" className="text-destructive" disabled={busy}>
                      <X className="size-4" />
                      Reject
                    </Button>
                  }
                />
              </>
            )}
            {isApproved && (
              <ConfirmAction
                title="Book the return as received?"
                description="Sellable units go back into stock; damaged units are scrapped. The ledger is reversed either way."
                confirmLabel="Receive"
                onConfirm={() => act("receive")}
                trigger={
                  <Button disabled={busy || !allGraded} title={allGraded ? undefined : "Grade every line first"}>
                    <PackageCheck className="size-4" />
                    Receive
                  </Button>
                }
              />
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-primary" />
              Reason
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{rma.reason || "No reason given."}</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm lg:col-span-2 overflow-hidden">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="text-base">Returned lines ({rma.lines.length})</CardTitle>
            {isApproved && canManage && (
              <CardDescription>Grade each line sellable or damaged once it physically arrives.</CardDescription>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/20">
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="w-[180px]">Condition</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rma.lines.map((line) => {
                  const orderLine = orderLines.get(line.order_line_id)
                  return (
                    <TableRow key={line.id}>
                      <TableCell>
                        <p className="text-sm font-medium">{orderLine?.product_name ?? "Order line"}</p>
                        <p className="font-mono text-xs uppercase text-muted-foreground">
                          {orderLine?.variant_sku ?? line.order_line_id.slice(0, 8)}
                        </p>
                      </TableCell>
                      <TableCell className="text-center font-semibold">{line.quantity}</TableCell>
                      <TableCell>
                        {isApproved && canManage ? (
                          <Select
                            value={line.condition || undefined}
                            onValueChange={(v) => grade(line, v as Exclude<RmaCondition, "">)}
                            disabled={busy}
                          >
                            <SelectTrigger className="h-8" aria-label={`Condition for ${orderLine?.product_name ?? "line"}`}>
                              <SelectValue placeholder="Not graded" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sellable">Sellable</SelectItem>
                              <SelectItem value="damaged">Damaged</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : line.condition ? (
                          <StatusBadge status={line.condition} />
                        ) : (
                          <span className="text-sm text-muted-foreground">Not graded</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default ReturnDetail
