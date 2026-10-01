import { useCallback, useEffect, useState } from "react"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { TableActions } from "@/components/common/TableActions"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeading } from "@/components/common/PageHeading"
import { api } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import { formatDate } from "@/lib/format"
import { useAppDispatch } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"

import { fetchAll } from "../slices/goodsReceiptSlice"
import type { GoodsReceipt, PurchaseOrder } from "../types"
import { useCanManagePurchasing, useDebouncedValue, useProcurementSelector } from "../hooks/useProcurement"
import { GRN_STATUS_LABEL, GRN_STATUS_TONE } from "../utils"
import { GoodsReceiptDialog } from "./GoodsReceiptDialog"

const PAGE_SIZE = 20
type Option = { label: string; value: string }

const unitsOf = (grn: GoodsReceipt) => grn.lines.reduce((s, l) => s + l.quantity_received, 0)

function ReceiptDetailDialog({ grn, onClose }: { grn: GoodsReceipt | null; onClose: () => void }) {
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
    <Dialog open={!!grn} onOpenChange={(open) => !open && onClose()}>
      {grn && (
        <DialogContent className="max-w-2xl">
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
            </DialogDescription>
          </DialogHeader>
          {!lineInfo ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PRODUCT</TableHead>
                  <TableHead className="text-right">QTY</TableHead>
                  <TableHead>CONDITION</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grn.lines.map((l) => {
                  const poLine = lineInfo.get(l.purchase_order_line_id)
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <p className="text-sm font-medium">{poLine?.product_name ?? "—"}</p>
                        <p className="text-xs font-mono text-muted-foreground">{poLine?.variant_sku ?? l.purchase_order_line_id}</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{l.quantity_received}</TableCell>
                      <TableCell>
                        <StatusBadge status={l.condition} tone={l.condition === "accepted" ? "success" : "destructive"} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      )}
    </Dialog>
  )
}

const GoodsReceipts = () => {
  useDocumentTitle("Goods Receipts")
  const dispatch = useAppDispatch()
  const { data, isFetchingList, error, totalItems, meta } = useProcurementSelector((state) => state.goodsReceipts)
  const canManage = useCanManagePurchasing()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search)
  const [ordering, setOrdering] = useState<Option | null>(null)
  const [viewing, setViewing] = useState<GoodsReceipt | null>(null)
  const [receiveOpen, setReceiveOpen] = useState(false)

  const load = useCallback(
    () =>
      dispatch(
        fetchAll({
          page,
          page_size: PAGE_SIZE,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(ordering ? { ordering: ordering.value } : {}),
        })
      ),
    [dispatch, page, debouncedSearch, ordering]
  )

  useEffect(() => {
    const request = load()
    return () => request.abort()
  }, [load])

  const columns: ColumnDef<GoodsReceipt>[] = [
    {
      accessorKey: "received_date",
      header: "RECEIVED",
      cell: ({ row }) => <span className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(row.original.received_date)}</span>,
    },
    {
      accessorKey: "purchase_order_number",
      header: "PURCHASE ORDER",
      cell: ({ row }) => (
        <Link
          to={`/purchasing/orders/${row.original.purchase_order_id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-sm font-semibold text-primary hover:underline"
        >
          {row.original.purchase_order_number}
        </Link>
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
      header: "ACTION",
      cell: ({ row }) => <TableActions itemName="goods receipt" onView={() => setViewing(row.original)} />,
    },
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Goods Receipts" description="Deliveries received against purchase orders (GRNs)." />
        {canManage && (
          <Button size="action" onClick={() => setReceiveOpen(true)}>
            <PackageCheck className="size-5" /> Receive Goods
          </Button>
        )}
      </div>

      <FilterToolbar
        searchPlaceholder="Search PO number or supplier..."
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        filters={[
          {
            component: (
              <ExampleComboboxCustomItems
                frameworks={[
                  { label: "Newest first", value: "-received_date" },
                  { label: "Oldest first", value: "received_date" },
                ]}
                placeholder="Sort"
                value={ordering}
                onValueChange={(v) => {
                  setOrdering(v)
                  setPage(1)
                }}
              />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={isFetchingList}
        error={error}
        onRetry={() => {
          load()
        }}
        manualPagination
        pageSize={PAGE_SIZE}
        pageIndex={page - 1}
        pageCount={meta?.totalPages ?? 1}
        totalCount={totalItems}
        onPageChange={(index) => setPage(index + 1)}
        onRowClick={setViewing}
        emptyIcon={PackageCheck}
        emptyTitle="No goods received yet"
        minWidth="760px"
        columnWidths={["130px", "170px", "90px", "90px", "130px", "80px"]}
      />

      <ReceiptDetailDialog grn={viewing} onClose={() => setViewing(null)} />
      <GoodsReceiptDialog open={receiveOpen} onOpenChange={setReceiveOpen} onReceived={() => load()} />
    </div>
  )
}

export default GoodsReceipts
