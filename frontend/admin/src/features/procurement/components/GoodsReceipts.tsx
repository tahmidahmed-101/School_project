import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { Loader2, PackageCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { SortSelect } from "@/components/common/SortSelect"
import { TableActions } from "@/components/common/TableActions"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeader } from "@/components/common/PageHeader"
import { DateCell, LinkCell } from "@/components/common/cells"
import { api } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import { formatDate } from "@/lib/format"
import type { Option } from "@/lib/types"
import { useAppDispatch } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import { useLastValue } from "@/hooks/use-dialog-presence"

import { fetchAll } from "../slices/goodsReceiptSlice"
import type { GoodsReceipt, PurchaseOrder } from "../types"
import { useCanManagePurchasing, useProcurementSelector } from "../hooks/useProcurement"
import { GRN_STATUS_LABEL, GRN_STATUS_TONE } from "../utils"
import { GoodsReceiptDialog } from "./GoodsReceiptDialog"

const SORT_OPTIONS: Option[] = [
  { label: "Newest first", value: "-received_date" },
  { label: "Oldest first", value: "received_date" },
]

const unitsOf = (grn: GoodsReceipt) => grn.lines.reduce((s, l) => s + l.quantity_received, 0)

function ReceiptDetailDialog({ grn: selected, onClose }: { grn: GoodsReceipt | null; onClose: () => void }) {
  // Keeps the last receipt on screen while the dialog fades out.
  const grn = useLastValue(selected)
  const [po, setPo] = useState<PurchaseOrder | null>(null)
  const poId = grn?.purchase_order_id

  // PO lines carry the product names the GRN lines reference by id.
  useEffect(() => {
    if (!poId) return
    const controller = new AbortController()
    const run = async () => {
      try {
        const res = await api.get(`/admin/procurement/purchase-orders/${poId}/`, { signal: controller.signal })
        setPo(unwrapItem<PurchaseOrder>(res.data))
      } catch {
        // Fall back to showing line ids.
      }
    }
    run()
    return () => controller.abort()
  }, [poId])

  const lineInfo = po && po.id === poId ? new Map(po.lines.map((l) => [l.id, l])) : null

  return (
    <Dialog open={!!selected} onOpenChange={(open) => !open && onClose()}>
      {grn && (
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              Goods receipt
              <StatusBadge status={grn.status} tone={GRN_STATUS_TONE[grn.status]} label={GRN_STATUS_LABEL[grn.status]} />
            </DialogTitle>
            <DialogDescription>
              Received {formatDate(grn.received_date)} against{" "}
              <Link to={`/purchasing/orders/${grn.purchase_order_id}`} className="text-primary hover:underline">
                {grn.purchase_order_number}
              </Link>
              {grn.warehouse_name ? ` into ${grn.warehouse_name}` : ""}
            </DialogDescription>
          </DialogHeader>
          {!lineInfo ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : (
            // Not `embedded`: the framed table scrolls inside its own height limit with the header
            // pinned, so a receipt with many lines can't grow the dialog past the screen.
            <DataTable
              surface="card"
              selectable={false}
              showPagination={false}
              columns={
                [
                  {
                    id: "product",
                    header: "PRODUCT",
                    cell: ({ row: { original: l } }) => {
                      const poLine = lineInfo.get(l.purchase_order_line_id)
                      return (
                        <div>
                          <p className="text-sm font-medium">{poLine?.product_name ?? "—"}</p>
                          <p className="text-xs font-mono text-muted-foreground">
                            {poLine?.variant_sku ?? l.purchase_order_line_id}
                          </p>
                        </div>
                      )
                    },
                  },
                  {
                    id: "qty",
                    header: "QTY",
                    meta: { align: "right" },
                    cell: ({ row }) => <span className="tabular-nums">{row.original.quantity_received}</span>,
                  },
                  {
                    id: "condition",
                    header: "CONDITION",
                    cell: ({ row }) => (
                      <StatusBadge
                        status={row.original.condition}
                        tone={row.original.condition === "accepted" ? "success" : "destructive"}
                      />
                    ),
                  },
                ] satisfies ColumnDef<GoodsReceipt["lines"][number]>[]
              }
              data={grn.lines}
              minWidth="0px"
              columnWidths={["auto", "80px", "130px"]}
            />
          )}
        </DialogContent>
      )}
    </Dialog>
  )
}

const GoodsReceipts = () => {
  useDocumentTitle("Goods receipts")
  const dispatch = useAppDispatch()
  const state = useProcurementSelector((state) => state.goodsReceipts)
  const canManage = useCanManagePurchasing()

  const [ordering, setOrdering] = useState<Option | null>(null)
  const [viewing, setViewing] = useState<GoodsReceipt | null>(null)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const list = useListPage({ fetch: (p) => dispatch(fetchAll(p)), state, params: { ordering: ordering?.value, kind: "stock" } })

  const columns: ColumnDef<GoodsReceipt>[] = [
    {
      accessorKey: "received_date",
      header: "RECEIVED",
      cell: ({ row }) => <DateCell value={row.original.received_date} className="text-muted-foreground" />,
    },
    {
      accessorKey: "purchase_order_number",
      header: "PURCHASE ORDER",
      cell: ({ row }) => (
        <LinkCell to={`/purchasing/orders/${row.original.purchase_order_id}`} className="font-mono font-semibold">
          {row.original.purchase_order_number}
        </LinkCell>
      ),
    },
    {
      id: "warehouse",
      header: "WAREHOUSE",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.warehouse_name ?? "Default"}</span>
      ),
    },
    {
      id: "lines",
      header: "LINES",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.lines.length}</span>,
    },
    {
      id: "units",
      header: "UNITS",
      cell: ({ row }) => <span className="text-sm font-semibold tabular-nums">{unitsOf(row.original)}</span>,
    },
    {
      accessorKey: "status",
      header: "QC STATUS",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          tone={GRN_STATUS_TONE[row.original.status]}
          label={GRN_STATUS_LABEL[row.original.status]}
        />
      ),
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => <TableActions itemName="goods receipt" onView={() => setViewing(row.original)} />,
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Goods receipts"
        actions={
          canManage && (
            <Button size="action" onClick={() => setReceiveOpen(true)}>
              <PackageCheck className="size-5" /> Receive Goods
            </Button>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search PO number or supplier..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[{ component: <SortSelect options={SORT_OPTIONS} value={ordering} onChange={setOrdering} /> }]}
      />

      <DataTable
        columns={columns}
        data={state.data}
        {...list.tableProps}
        onRowClick={setViewing}
        emptyIcon={PackageCheck}
        emptyTitle="No goods received yet"
        minWidth="920px"
        columnWidths={["130px", "170px", "160px", "90px", "90px", "130px", "80px"]}
      />

      <ReceiptDetailDialog grn={viewing} onClose={() => setViewing(null)} />
      <GoodsReceiptDialog open={receiveOpen} onOpenChange={setReceiveOpen} onReceived={list.reload} />
    </div>
  )
}

export default GoodsReceipts
