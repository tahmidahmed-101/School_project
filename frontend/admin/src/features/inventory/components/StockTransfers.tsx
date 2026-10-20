import { useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { ArrowLeftRight, ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/common/ComboBox"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { DateCell } from "@/components/common/cells"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useKind, type Kind } from "@/hooks/use-kind"
import { useListPage } from "@/hooks/use-list-page"
import type { Option } from "@/lib/types"

import { fetchAll } from "../slices/transferSlice"
import { useWarehouses } from "../lib/useWarehouses"
import type { StockTransfer } from "../types"
import { StockTransferDialog } from "./StockTransferDialog"

/** Stock moved between warehouses of one kind, newest first; staff with inventory.manage start new ones. */
const StockTransfers = ({ kind }: { kind: Kind }) => {
  const title = kind === "preorder" ? "Pre-order transfers" : "Stock transfers"
  useDocumentTitle(title)
  const dispatch = useAppDispatch()
  // POST /admin/inventory/transfers/ needs inventory.manage; the list needs inventory.view.
  const canManage = useCan("inventory.manage")
  const transferState = useAppSelector((s) => s.inventoryTransfers)
  const { warehouses } = useWarehouses(kind)

  const [warehouse, setWarehouse] = useState<Option | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const list = useListPage({
    fetch: (p) => dispatch(fetchAll(p)),
    state: transferState,
    params: { kind, warehouse_id: warehouse?.value },
  })

  const activeWarehouses = warehouses.filter((w) => w.is_active && !w.deleted_at)
  // A transfer needs somewhere to move to.
  const canTransfer = canManage && activeWarehouses.length >= 2
  const warehouseOptions: Option[] = warehouses.map((w) => ({ label: w.name, value: w.id }))

  const columns: ColumnDef<StockTransfer>[] = [
    {
      accessorKey: "transfer_number",
      header: "TRANSFER",
      cell: ({ row }) => <span className="font-medium">{row.original.transfer_number}</span>,
    },
    {
      id: "route",
      header: "FROM → TO",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 text-sm">
          {row.original.from_warehouse_name}
          <ArrowRight className="size-3.5 text-muted-foreground" />
          {row.original.to_warehouse_name}
        </span>
      ),
    },
    {
      id: "items",
      header: "ITEMS",
      // Transfers are read in full here, so every line is listed instead of a count.
      cell: ({ row }) => (
        <ul className="space-y-0.5 whitespace-normal text-sm">
          {row.original.lines.map((line) => (
            <li key={line.id}>
              <span className="font-medium tabular-nums">{line.quantity} ×</span> {line.product_name}
              {line.variant_title ? ` — ${line.variant_title}` : ""}{" "}
              <span className="text-xs text-muted-foreground">{line.variant_sku}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "notes",
      header: "NOTE",
      cell: ({ row }) => (
        <span className="whitespace-normal break-words text-sm text-muted-foreground">{row.original.notes || "—"}</span>
      ),
    },
    {
      accessorKey: "created_at",
      header: "DATE",
      cell: ({ row }) => <DateCell value={row.original.created_at} withTime className="text-muted-foreground" />,
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title={title}
        actions={
          canManage && (
            <Button
              size="action"
              disabled={!canTransfer}
              title={canTransfer ? undefined : "Add a second active warehouse to transfer stock"}
              onClick={() => setFormOpen(true)}
            >
              <ArrowLeftRight className="size-5" /> Transfer stock
            </Button>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search transfer number, note or SKU…"
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[
          {
            active: Boolean(warehouse),
            component: (
              <Combobox
                placeholder="Warehouse"
                options={warehouseOptions}
                value={warehouse}
                onValueChange={setWarehouse}
              />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={transferState.data}
        {...list.tableProps}
        emptyIcon={ArrowLeftRight}
        emptyTitle="No transfers"
        emptyDescription={
          list.debouncedSearch || warehouse
            ? "Try adjusting the search or filters."
            : activeWarehouses.length < 2
              ? "Transfers move stock between warehouses. Add a second warehouse to start."
              : "Stock moved between warehouses appears here."
        }
        minWidth="980px"
        columnWidths={["150px", "260px", "auto", "200px", "170px"]}
      />

      {canManage && (
        <StockTransferDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          kind={kind}
          warehouses={warehouses}
          onDone={list.reload}
        />
      )}
    </div>
  )
}

const StockTransfersPage = () => {
  const kind = useKind()
  return <StockTransfers key={kind} kind={kind} />
}

export default StockTransfersPage
