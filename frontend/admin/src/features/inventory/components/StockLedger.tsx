import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { DownloadIcon, History, Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { PageHeading } from "@/components/common/PageHeading"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { useDebounced } from "@/features/catalog/lib/useDebounced"
import { VariantPicker } from "@/features/catalog/components/VariantPicker"

import { fetchAll } from "../slices/ledgerSlice"
import { downloadLedgerExport } from "../api"
import { movementTypeLabel, movementTypeOptions, type StockLedgerEntry } from "../types"
import { useWarehouses } from "../lib/useWarehouses"

type Option = { label: string; value: string }
const PAGE_SIZE = 25

const StockLedger = () => {
  useDocumentTitle("Stock Ledger")
  const dispatch = useAppDispatch()
  const { data: entries, isFetchingList, error, totalItems } = useAppSelector((s) => s.inventoryLedger)
  const { warehouses } = useWarehouses()
  const [searchParams, setSearchParams] = useSearchParams()
  const variantId = searchParams.get("variant_id")
  const variantSku = searchParams.get("sku")

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounced(search)
  const [warehouse, setWarehouse] = useState<Option | null>(null)
  const [movement, setMovement] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(null)
  const [exporting, setExporting] = useState(false)

  const filters = useMemo(
    () => ({
      ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      ...(variantId ? { variant_id: variantId } : {}),
      ...(warehouse ? { warehouse_id: warehouse.value } : {}),
      ...(movement ? { movement_type: movement.value } : {}),
      ...(ordering ? { ordering: ordering.value } : {}),
    }),
    [debouncedSearch, variantId, warehouse, movement, ordering]
  )
  const load = useCallback(() => {
    dispatch(fetchAll({ page, page_size: PAGE_SIZE, ...filters }))
  }, [dispatch, page, filters])
  useEffect(() => {
    load()
  }, [load])

  const setVariant = (v: { id: string; sku: string } | null) => {
    setPage(1)
    const next = new URLSearchParams(searchParams)
    if (v) {
      next.set("variant_id", v.id)
      next.set("sku", v.sku)
    } else {
      next.delete("variant_id")
      next.delete("sku")
    }
    setSearchParams(next, { replace: true })
  }

  const runExport = async () => {
    setExporting(true)
    try {
      await downloadLedgerExport(filters)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Export failed"))
    } finally {
      setExporting(false)
    }
  }

  const columns: ColumnDef<StockLedgerEntry>[] = [
    {
      accessorKey: "created_at",
      header: "DATE",
      cell: ({ row }) => <span className="text-sm whitespace-nowrap">{formatDateTime(row.original.created_at)}</span>,
    },
    {
      id: "item",
      header: "ITEM",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{row.original.product_name}</div>
          <div className="truncate font-mono text-xs text-muted-foreground">{row.original.variant_sku}</div>
        </div>
      ),
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
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.unit_cost === null ? "—" : formatCurrency(row.original.unit_cost)}
        </span>
      ),
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
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Stock Ledger" description="Every stock movement, newest first" />
        <Button variant="primary" size="action" onClick={runExport} disabled={exporting}>
          {exporting ? <Loader2 className="size-5 animate-spin" /> : <DownloadIcon className="size-5" />} Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Variant:</span>
        {variantId ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-3 py-1 font-mono text-xs">
            {variantSku ?? variantId}
            <button type="button" aria-label="Clear variant filter" onClick={() => setVariant(null)}>
              <X className="size-3.5" />
            </button>
          </span>
        ) : (
          <VariantPicker
            className="w-full max-w-sm"
            value={null}
            onChange={(v) => v && setVariant(v)}
            placeholder="Filter by variant…"
          />
        )}
        <Link to="/inventory" className="ml-auto text-sm text-primary hover:underline">
          Back to stock
        </Link>
      </div>

      <FilterToolbar
        searchPlaceholder="Search SKU, product or notes…"
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        filters={[
          {
            component: (
              <ExampleComboboxCustomItems
                placeholder="Warehouse"
                frameworks={warehouses.map((w) => ({ label: `${w.name} (${w.code})`, value: w.id }))}
                value={warehouse}
                onValueChange={(v) => {
                  setWarehouse(v)
                  setPage(1)
                }}
              />
            ),
          },
          {
            component: (
              <ExampleComboboxCustomItems
                placeholder="Movement"
                frameworks={movementTypeOptions}
                value={movement}
                onValueChange={(v) => {
                  setMovement(v)
                  setPage(1)
                }}
              />
            ),
          },
          {
            component: (
              <ExampleComboboxCustomItems
                placeholder="Sort"
                frameworks={[
                  { label: "Newest first", value: "-created_at" },
                  { label: "Oldest first", value: "created_at" },
                ]}
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
        data={entries}
        isLoading={isFetchingList}
        error={error}
        onRetry={load}
        manualPagination
        pageSize={PAGE_SIZE}
        pageIndex={page - 1}
        pageCount={Math.max(1, Math.ceil(totalItems / PAGE_SIZE))}
        totalCount={totalItems}
        onPageChange={(i) => setPage(i + 1)}
        emptyIcon={History}
        emptyTitle="No movements"
        emptyDescription="No ledger entries match these filters."
        minWidth="1100px"
        columnWidths={["170px", "230px", "100px", "160px", "80px", "90px", "110px", "200px"]}
      />
    </div>
  )
}

export default StockLedger
