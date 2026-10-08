import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { History } from "lucide-react"

import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { Combobox } from "@/components/common/ComboBox"
import { ExportButton } from "@/components/common/ExportButton"
import { PageHeader } from "@/components/common/PageHeader"
import { SortSelect } from "@/components/common/SortSelect"
import { StatusBadge } from "@/components/common/StatusBadge"
import { DateCell, MoneyCell, ProductCell } from "@/components/common/cells"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useKind } from "@/hooks/use-kind"
import { useListPage } from "@/hooks/use-list-page"
import type { Option } from "@/lib/types"
import { VariantPicker, type PickedVariant } from "@/components/common/VariantPicker"

import { fetchAll } from "../slices/ledgerSlice"
import { downloadLedgerExport } from "../api"
import { movementTypeLabel, movementTypeOptions, type StockLedgerEntry } from "../types"
import { useWarehouses } from "../lib/useWarehouses"

const PAGE_SIZE = 25
const ORDERING_OPTIONS: Option[] = [
  { label: "Newest first", value: "-created_at" },
  { label: "Oldest first", value: "created_at" },
]

const StockLedgerList = () => {
  const kind = useKind()
  const title = kind === "preorder" ? "Pre-order goods movements" : "Stock Ledger"
  useDocumentTitle(title)
  const dispatch = useAppDispatch()
  const ledgerState = useAppSelector((s) => s.inventoryLedger)
  const { warehouses } = useWarehouses(kind)
  const [searchParams, setSearchParams] = useSearchParams()
  const variantId = searchParams.get("variant_id")
  const variantSku = searchParams.get("sku")
  const variantName = searchParams.get("name")
  // The variant lives in the URL so Stock Overview and product pages can deep-link here; those links carry only the SKU.
  const variant: PickedVariant | null = variantId
    ? { id: variantId, sku: variantName ? variantSku ?? "" : "", product_name: variantName ?? variantSku ?? variantId }
    : null

  const [warehouse, setWarehouse] = useState<Option | null>(null)
  const [movement, setMovement] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(null)

  const list = useListPage({
    fetch: (p) => dispatch(fetchAll(p)),
    state: ledgerState,
    pageSize: PAGE_SIZE,
    params: {
      kind,
      variant_id: variantId,
      warehouse_id: warehouse?.value,
      movement_type: movement?.value,
      ordering: ordering?.value,
    },
  })

  const setVariant = (v: PickedVariant | null) => {
    const next = new URLSearchParams(searchParams)
    if (v) {
      next.set("variant_id", v.id)
      next.set("sku", v.sku)
      next.set("name", v.product_name)
    } else {
      next.delete("variant_id")
      next.delete("sku")
      next.delete("name")
    }
    setSearchParams(next, { replace: true })
  }

  const columns: ColumnDef<StockLedgerEntry>[] = [
    {
      accessorKey: "created_at",
      header: "DATE",
      cell: ({ row }) => <DateCell value={row.original.created_at} withTime />,
    },
    {
      id: "item",
      header: "ITEM",
      cell: ({ row }) => <ProductCell name={row.original.product_name} sku={row.original.variant_sku} />,
    },
    {
      id: "warehouse",
      header: "WAREHOUSE",
      cell: ({ row }) => <span className="text-sm">{row.original.warehouse_code}</span>,
    },
    {
      accessorKey: "movement_type",
      header: "MOVEMENT",
      cell: ({ row }) => {
        const t = row.original.movement_type
        const tone = t.endsWith("_in") ? "success" : t === "write_off" ? "destructive" : t === "sales_out" ? "info" : "warning"
        return <StatusBadge status={t} tone={tone} label={movementTypeLabel(t)} className="normal-case" />
      },
    },
    {
      accessorKey: "quantity",
      header: "QTY",
      cell: ({ row }) => {
        const out = !row.original.movement_type.endsWith("_in")
        return (
          <span className={`text-sm font-semibold tabular-nums ${out ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
            {out ? "−" : "+"}
            {Math.abs(row.original.quantity)}
          </span>
        )
      },
    },
    {
      accessorKey: "balance_after",
      header: "BALANCE",
      cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.balance_after}</span>,
    },
    {
      accessorKey: "unit_cost",
      header: "UNIT COST",
      cell: ({ row }) => <MoneyCell value={row.original.unit_cost} className="text-muted-foreground" />,
    },
    {
      id: "reference",
      header: "REFERENCE / NOTES",
      cell: ({ row }) => (
        <div className="min-w-0 text-xs text-muted-foreground">
          {row.original.reference_type && <div className="truncate">{row.original.reference_type.replace(/_/g, " ")}</div>}
          {row.original.notes && <div className="line-clamp-2">{row.original.notes}</div>}
          {!row.original.reference_type && !row.original.notes && "—"}
        </div>
      ),
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title={title}
        actions={<ExportButton onExport={() => downloadLedgerExport(list.query)} />}
      />

      <FilterToolbar
        inlineCount={3}
        filters={[
          {
            wide: true,
            active: Boolean(variant),
            component: (
              <VariantPicker
                value={variant}
                onChange={setVariant}
                placeholder="Filter by variant…"
                filters={{ category_type: kind }}
              />
            ),
          },
          {
            component: (
              <Combobox
                placeholder="Warehouse"
                options={warehouses.map((w) => ({ label: `${w.name} (${w.code})`, value: w.id }))}
                value={warehouse}
                onValueChange={setWarehouse}
              />
            ),
          },
          {
            component: (
              <Combobox
                placeholder="Movement"
                options={movementTypeOptions}
                value={movement}
                onValueChange={setMovement}
              />
            ),
          },
          {
            component: <SortSelect options={ORDERING_OPTIONS} value={ordering} onChange={setOrdering} />,
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={ledgerState.data}
        {...list.tableProps}
        emptyIcon={History}
        emptyTitle="No movements"
        emptyDescription="No ledger entries match these filters."
        minWidth="1100px"
        columnWidths={["170px", "230px", "100px", "160px", "80px", "90px", "110px", "200px"]}
      />
    </div>
  )
}

const StockLedger = () => <StockLedgerList key={useKind()} />

export default StockLedger
