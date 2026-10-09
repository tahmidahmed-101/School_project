import type { ColumnDef } from "@tanstack/react-table"
import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Check, PackageCheck, RotateCcw, X } from "lucide-react"

import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchReturn, gradeReturnLine, runReturnAction, type RmaAction } from "@/features/returns/slices/returnSlice"
import type { Rma, RmaCondition, RmaLine } from "@/features/returns/types"
import { fetchOrderById } from "@/features/sales/slices/orderSlice"
import { KIND_PATHS, orderNoun } from "@/features/sales/shared/kindPaths"
import { useKindHint, useRecordKind } from "@/hooks/use-kind"
import type { Order, OrderLine } from "@/features/sales/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable } from "@/components/common/data-table"
import { DetailPageState } from "@/components/common/DetailPageState"
import { StatusBadge } from "@/components/common/StatusBadge"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { PageHeader } from "@/components/common/PageHeader"
import { ProductCell } from "@/components/common/cells"
import { useCan } from "@/hooks/use-can"
import { useDetailLoad } from "@/hooks/use-detail-load"
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
  const dispatch = useAppDispatch()
  const canManage = useCan("returns.manage")

  const { singleData, singleStatus, singleError } = useAppSelector((state) => state.returns)
  const rma = singleData && (singleData as Rma).id === id ? (singleData as Rma) : null

  useDocumentTitle(rma ? `${rma.rma_number} — Return` : "Return Details")

  // The RMA only carries order_line ids; the order supplies product names and SKUs.
  const [order, setOrder] = useState<Order | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useDetailLoad(fetchReturn, id)

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

  const hint = useKindHint()
  const recordKind = rma?.order_type ?? order?.order_type
  useRecordKind(rma ? recordKind : undefined)

  const pageState = resolveDetailState(singleStatus, singleError, !!rma)
  if (pageState || !rma) {
    return (
      <DetailPageState
        state={pageState ?? "loading"}
        entity="Return"
        backTo={hint && KIND_PATHS[hint].returns}
        backLabel={hint === "preorder" ? "Back to pre-order returns" : "Back to returns"}
        error={singleError}
        onRetry={load}
      />
    )
  }

  const kind = recordKind ?? "stock"
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

  const lineColumns: ColumnDef<RmaLine>[] = [
    {
      id: "product",
      header: "Product",
      cell: ({ row: { original: line } }) => {
        const orderLine = orderLines.get(line.order_line_id)
        return (
          <ProductCell
            name={orderLine?.product_name ?? "Order line"}
            sku={orderLine?.variant_sku ?? line.order_line_id.slice(0, 8)}
          />
        )
      },
    },
    {
      id: "qty",
      header: "Qty",
      meta: { align: "center" },
      cell: ({ row }) => <span className="font-semibold">{row.original.quantity}</span>,
    },
    {
      id: "condition",
      header: "Condition",
      cell: ({ row: { original: line } }) =>
        isApproved && canManage ? (
          <Select
            value={line.condition || undefined}
            onValueChange={(v) => grade(line, v as Exclude<RmaCondition, "">)}
            disabled={busy}
          >
            <SelectTrigger
              className="h-8"
              aria-label={`Condition for ${orderLines.get(line.order_line_id)?.product_name ?? "line"}`}
            >
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
        ),
    },
  ]

  return (
    <div className="section-container space-y-6">
      <PageHeader
        back={{
          to: KIND_PATHS[kind].returns,
          label: kind === "preorder" ? "Back to pre-order returns" : "Back to returns",
        }}
        title={rma.rma_number}
        badges={<StatusBadge status={rma.status} />}
        description={
          order ? (
            <>
              Return for {orderNoun(kind)}{" "}
              <Link to={`/order_detail/${rma.order_id}`} className="text-primary hover:underline">
                {order.order_number}
              </Link>
            </>
          ) : (
            <Link to={`/order_detail/${rma.order_id}`} className="text-primary hover:underline">
              View {orderNoun(kind)}
            </Link>
          )
        }
        actions={
          canManage && (isRequested || isApproved) && (
            <>
              {isRequested && (
                <>
                  <ConfirmDialog
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
                  <ConfirmDialog
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
                <ConfirmDialog
                  title="Book the return as received?"
                  description={
                    kind === "preorder"
                      ? "Sellable units go back with the other arrived pre-order items; damaged units are scrapped. The ledger is reversed either way."
                      : "Sellable units go back into stock; damaged units are scrapped. The ledger is reversed either way."
                  }
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
            </>
          )
        }
      />

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
            <DataTable
              embedded
              showPagination={false}
              columns={lineColumns}
              data={rma.lines}
              minWidth="0px"
              columnWidths={["auto", "80px", "180px"]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default ReturnDetail
