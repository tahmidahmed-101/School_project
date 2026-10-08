import { toast } from "sonner"
import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { Archive, ArrowDownToLine, Ban, CircleCheck, History, Lock, MinusCircle, Package, SlidersHorizontal, Truck, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { Combobox } from "@/components/common/ComboBox"
import { PageHeader } from "@/components/common/PageHeader"
import { SortSelect } from "@/components/common/SortSelect"
import { MoneyCell, ProductCell } from "@/components/common/cells"
import { TableActions } from "@/components/common/TableActions"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import type { Option } from "@/lib/types"
import type { PickedVariant } from "@/components/common/VariantPicker"
import { getApiErrorMessage } from "@/lib/api/client"

import { fetchAll } from "../slices/stockItemSlice"
import { deleteStockItem, fetchStockStatus } from "../api"
import type { StockItem, StockStatusSummary } from "../types"
import { useWarehouses } from "../lib/useWarehouses"
import { StockMovementDialog, type MovementMode } from "./StockMovementDialog"
import { BulkAdjustDialog } from "./BulkAdjustDialog"

const PAGE_SIZE = 25

const STATUS_CARDS: { key: keyof StockStatusSummary; label: string; icon: typeof Package; tone: string }[] = [
  { key: "sellable", label: "Sellable", icon: CircleCheck, tone: "text-green-600 dark:text-green-400" },
  { key: "reserved", label: "Reserved", icon: Lock, tone: "text-blue-600 dark:text-blue-400" },
  { key: "in_transit", label: "In transit", icon: Truck, tone: "text-amber-600 dark:text-amber-400" },
  { key: "quarantine", label: "Quarantine", icon: Ban, tone: "text-orange-600 dark:text-orange-400" },
  { key: "pending_return_inspection", label: "Returns to inspect", icon: Undo2, tone: "text-purple-600 dark:text-purple-400" },
  { key: "written_off", label: "Written off", icon: Archive, tone: "text-red-600 dark:text-red-400" },
]

const orderingOptions: Option[] = [
  { label: "Warehouse, SKU", value: "" },
  { label: "On hand: low → high", value: "quantity_on_hand" },
  { label: "On hand: high → low", value: "-quantity_on_hand" },
  { label: "Newest first", value: "-created_at" },
]

const StockOverview = () => {
  useDocumentTitle("Stock")
  const dispatch = useAppDispatch()
  const canAdjust = useCan("inventory.adjust", "inventory.manage")
  const stockState = useAppSelector((s) => s.inventoryStockItems)
  const { warehouses } = useWarehouses()

  const [status, setStatus] = useState<StockStatusSummary | null>(null)
  const [statusError, setStatusError] = useState<unknown>(null)
  const [statusKey, setStatusKey] = useState(0)

  const [warehouse, setWarehouse] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(null)
  const [lowOnly, setLowOnly] = useState(false)

  const [movement, setMovement] = useState<{ mode: MovementMode; variant?: PickedVariant; warehouseId?: string } | null>(
    null
  )
  const [bulkOpen, setBulkOpen] = useState(false)


  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const s = await fetchStockStatus()
        if (!cancelled) {
          setStatus(s)
          setStatusError(null)
        }
      } catch (err) {
        if (!cancelled) setStatusError(err)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [statusKey])

  // ?search= arrives from a refused product delete, pointing at the stock to write off.
  const [searchParams] = useSearchParams()
  const list = useListPage({
    fetch: (p) => dispatch(fetchAll(p)),
    state: stockState,
    pageSize: PAGE_SIZE,
    initialSearch: searchParams.get("search") ?? "",
    params: {
      warehouse_id: warehouse?.value,
      ordering: ordering?.value,
      low_stock_only: lowOnly || undefined,
    },
  })

  const refreshAll = () => {
    list.reload()
    setStatusKey((k) => k + 1)
  }

  const rowVariant = (s: StockItem): PickedVariant => ({ id: s.variant_id, sku: s.variant_sku, product_name: s.product_name })

  const columns: ColumnDef<StockItem>[] = [
    {
      id: "item",
      header: "ITEM",
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
            {row.original.product_image ? (
              <img loading="lazy" decoding="async" src={row.original.product_image} alt="" className="size-full object-cover" />
            ) : (
              <Package className="size-4 text-muted-foreground" />
            )}
          </div>
          <ProductCell name={row.original.product_name} sku={row.original.variant_sku} />
        </div>
      ),
    },
    {
      id: "warehouse",
      header: "WAREHOUSE",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.warehouse_name} <span className="text-xs text-muted-foreground">({row.original.warehouse_code})</span>
        </span>
      ),
    },
    { accessorKey: "quantity_on_hand", header: "ON HAND" },
    { accessorKey: "quantity_reserved", header: "RESERVED" },
    {
      accessorKey: "available",
      header: "AVAILABLE",
      cell: ({ row }) => {
        const s = row.original
        const cls =
          s.available <= 0
            ? "font-semibold text-destructive"
            : s.available <= s.reorder_point
              ? "font-semibold text-amber-600 dark:text-amber-400"
              : "font-semibold"
        return <span className={`text-sm ${cls}`}>{s.available}</span>
      },
    },
    {
      id: "reorder",
      header: "REORDER / TARGET",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.reorder_point} / {row.original.target_stock_level}
        </span>
      ),
    },
    {
      accessorKey: "avg_cost",
      header: "AVG COST",
      cell: ({ row }) => <MoneyCell value={row.original.avg_cost} />,
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => {
        const s = row.original
        return (
          <TableActions
            itemName={`the stock record for ${s.variant_sku} in ${s.warehouse_name}`}
            onDelete={
              canAdjust
                ? async () => {
                    try {
                      await deleteStockItem(s.id)
                      toast.success(`Stock record for ${s.variant_sku} removed`)
                      refreshAll()
                    } catch (err) {
                      toast.error(getApiErrorMessage(err, "Failed to remove the stock record"))
                    }
                  }
                : undefined
            }
            actions={[
              ...(canAdjust
                ? [
                    {
                      label: "Adjust",
                      icon: SlidersHorizontal,
                      onSelect: () => setMovement({ mode: "adjust", variant: rowVariant(s), warehouseId: s.warehouse_id }),
                    },
                    {
                      label: "Write off",
                      icon: MinusCircle,
                      destructive: true,
                      onSelect: () =>
                        setMovement({ mode: "write_off", variant: rowVariant(s), warehouseId: s.warehouse_id }),
                    },
                  ]
                : []),
              {
                label: "Ledger",
                icon: History,
                to: `/inventory/ledger?variant_id=${s.variant_id}&sku=${encodeURIComponent(s.variant_sku)}`,
              },
            ]}
          />
        )
      },
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Stock"
        actions={
          canAdjust && (
            <>
              <Button size="action" onClick={() => setMovement({ mode: "intake" })}>
                <ArrowDownToLine className="size-5" /> Receive stock
              </Button>
              <Button variant="primary" size="action" onClick={() => setMovement({ mode: "adjust" })}>
                <SlidersHorizontal className="size-5" /> Adjust
              </Button>
              <Button variant="primary" size="action" onClick={() => setBulkOpen(true)}>
                <SlidersHorizontal className="size-5" /> Bulk adjust
              </Button>
              <Button variant="primary" size="action" onClick={() => setMovement({ mode: "write_off" })}>
                <MinusCircle className="size-5" /> Write off
              </Button>
            </>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {STATUS_CARDS.map(({ key, label, icon: Icon, tone }) => (
          <Card key={key} className="gap-1 py-4">
            <CardContent className="space-y-1 px-4">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Icon className={`size-4 ${tone}`} /> {label}
              </div>
              {status ? (
                <div className="text-2xl font-bold tabular-nums">{status[key].toLocaleString()}</div>
              ) : statusError ? (
                <div className="text-sm text-destructive">—</div>
              ) : (
                <Skeleton className="h-7 w-16" />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <FilterToolbar
        searchPlaceholder="Search SKU, barcode or product…"
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[
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
              <SortSelect options={orderingOptions} value={ordering} onChange={setOrdering} />
            ),
          },
          {
            component: (
              <div className="flex items-center gap-2">
                <Switch
                  id="stock-low-only"
                  checked={lowOnly}
                  onCheckedChange={setLowOnly}
                />
                <Label htmlFor="stock-low-only" className="whitespace-nowrap text-sm">
                  At or below reorder point
                </Label>
              </div>
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={stockState.data}
        {...list.tableProps}
        emptyIcon={Package}
        emptyTitle="No stock items"
        emptyDescription="Nothing matches these filters."
        minWidth="1060px"
        columnWidths={["260px", "170px", "90px", "90px", "100px", "130px", "110px", "80px"]}
        unlabelledColumns={["actions"]}
      />

      <StockMovementDialog
        mode={movement?.mode ?? null}
        onOpenChange={(o) => !o && setMovement(null)}
        warehouses={warehouses}
        variant={movement?.variant ?? null}
        warehouseId={movement?.warehouseId ?? null}
        onDone={refreshAll}
      />
      <BulkAdjustDialog open={bulkOpen} onOpenChange={setBulkOpen} warehouses={warehouses} onDone={refreshAll} />
    </div>
  )
}

export default StockOverview
