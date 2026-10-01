import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import {
  Archive,
  ArrowDownToLine,
  Ban,
  CircleCheck,
  History,
  Loader2,
  Lock,
  MinusCircle,
  Package,
  ScanBarcode,
  SlidersHorizontal,
  Truck,
  Undo2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { PageHeading } from "@/components/common/PageHeading"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency } from "@/lib/format"
import { usePermission } from "@/features/catalog/lib/usePermission"
import { useDebounced } from "@/features/catalog/lib/useDebounced"
import type { PickedVariant } from "@/features/catalog/components/VariantPicker"

import { fetchAll } from "../slices/stockItemSlice"
import { fetchStockStatus, lookupStock } from "../api"
import type { StockItem, StockLookupResult, StockStatusSummary } from "../types"
import { useWarehouses } from "../lib/useWarehouses"
import { StockMovementDialog, type MovementMode } from "./StockMovementDialog"
import { BulkAdjustDialog } from "./BulkAdjustDialog"
import { QuickProductDialog } from "./QuickProductDialog"

type Option = { label: string; value: string }
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
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canAdjust = usePermission("inventory.adjust", "inventory.manage")
  const canQuickCreate = usePermission("catalog.manage", "inventory.manage")
  const { data: items, isFetchingList, error, totalItems } = useAppSelector((s) => s.inventoryStockItems)
  const { warehouses } = useWarehouses()

  const [status, setStatus] = useState<StockStatusSummary | null>(null)
  const [statusError, setStatusError] = useState<unknown>(null)
  const [statusKey, setStatusKey] = useState(0)

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounced(search)
  const [warehouse, setWarehouse] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(null)
  const [lowOnly, setLowOnly] = useState(false)

  const [movement, setMovement] = useState<{ mode: MovementMode; variant?: PickedVariant; warehouseId?: string } | null>(
    null
  )
  const [bulkOpen, setBulkOpen] = useState(false)

  const [lookupCode, setLookupCode] = useState("")
  const [lookupBusy, setLookupBusy] = useState(false)
  const [lookup, setLookup] = useState<StockLookupResult | null>(null)
  const [quickOpen, setQuickOpen] = useState(false)

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

  const params = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      ...(warehouse ? { warehouse_id: warehouse.value } : {}),
      ...(ordering?.value ? { ordering: ordering.value } : {}),
      ...(lowOnly ? { low_stock_only: true } : {}),
    }),
    [page, debouncedSearch, warehouse, ordering, lowOnly]
  )
  const load = useCallback(() => {
    dispatch(fetchAll(params))
  }, [dispatch, params])
  useEffect(() => {
    load()
  }, [load])

  const refreshAll = () => {
    load()
    setStatusKey((k) => k + 1)
    if (lookup?.found) void runLookup(lookup.sku)
  }

  const runLookup = async (code: string) => {
    const q = code.trim()
    if (!q) return
    setLookupBusy(true)
    try {
      setLookup(await lookupStock(q))
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Lookup failed"))
    } finally {
      setLookupBusy(false)
    }
  }

  const lookupVariant: PickedVariant | undefined =
    lookup?.found === true
      ? { id: lookup.variant_id, sku: lookup.sku, product_name: lookup.product_name, price: lookup.price }
      : undefined

  const rowVariant = (s: StockItem): PickedVariant => ({ id: s.variant_id, sku: s.variant_sku, product_name: s.product_name })

  const columns: ColumnDef<StockItem>[] = [
    {
      id: "item",
      header: "ITEM",
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
            {row.original.product_image ? (
              <img src={row.original.product_image} alt="" className="size-full object-cover" />
            ) : (
              <Package className="size-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{row.original.product_name}</div>
            <div className="truncate font-mono text-xs text-muted-foreground">{row.original.variant_sku}</div>
          </div>
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
      cell: ({ row }) => <span className="text-sm">{formatCurrency(row.original.avg_cost)}</span>,
    },
    {
      id: "actions",
      header: "ACTION",
      cell: ({ row }) => {
        const s = row.original
        const action = (label: string, icon: React.ReactNode, onClick: () => void) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`${label} ${s.variant_sku}`} onClick={onClick}>
                {icon}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        )
        return (
          <TooltipProvider>
            <div className="flex items-center gap-0.5" data-no-row-click>
              {canAdjust &&
                action("Adjust", <SlidersHorizontal className="size-4" />, () =>
                  setMovement({ mode: "adjust", variant: rowVariant(s), warehouseId: s.warehouse_id })
                )}
              {canAdjust &&
                action("Write off", <MinusCircle className="size-4 text-destructive" />, () =>
                  setMovement({ mode: "write_off", variant: rowVariant(s), warehouseId: s.warehouse_id })
                )}
              {action("Ledger", <History className="size-4" />, () =>
                navigate(`/inventory/ledger?variant_id=${s.variant_id}&sku=${encodeURIComponent(s.variant_sku)}`)
              )}
            </div>
          </TooltipProvider>
        )
      },
    },
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Stock" description="On-hand, reserved and available stock per warehouse" />
        {canAdjust && (
          <div className="flex flex-wrap gap-2">
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
          </div>
        )}
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanBarcode className="size-4" /> Quick lookup
          </CardTitle>
          <CardDescription>Scan or type an exact SKU or barcode.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex max-w-xl gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void runLookup(lookupCode)
            }}
          >
            <Input
              aria-label="SKU or barcode"
              placeholder="SKU or barcode"
              value={lookupCode}
              onChange={(e) => setLookupCode(e.target.value)}
            />
            <Button type="submit" disabled={!lookupCode.trim() || lookupBusy}>
              {lookupBusy && <Loader2 className="size-4 animate-spin" />} Look up
            </Button>
          </form>
          {lookup?.found === true && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <Link to={`/product_detail/${lookup.product_id}`} className="font-medium hover:underline">
                  {lookup.product_name}
                </Link>
                <div className="font-mono text-xs text-muted-foreground">
                  {lookup.sku}
                  {lookup.barcode ? ` · ${lookup.barcode}` : ""}
                </div>
                <div className="text-sm">
                  <span className="font-semibold">{lookup.available}</span> available ·{" "}
                  {formatCurrency(lookup.price)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {canAdjust && (
                  <>
                    <Button size="sm" onClick={() => setMovement({ mode: "intake", variant: lookupVariant })}>
                      <ArrowDownToLine /> Receive
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setMovement({ mode: "adjust", variant: lookupVariant })}>
                      <SlidersHorizontal /> Adjust
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/inventory/ledger?variant_id=${lookup.variant_id}&sku=${encodeURIComponent(lookup.sku)}`}>
                    <History /> Ledger
                  </Link>
                </Button>
              </div>
            </div>
          )}
          {lookup?.found === false && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3 text-sm">
              <span>
                No variant matches <span className="font-mono">{lookup.query}</span>.
              </span>
              {canQuickCreate && (
                <Button size="sm" variant="outline" onClick={() => setQuickOpen(true)}>
                  Create product
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <FilterToolbar
        searchPlaceholder="Search SKU, barcode or product…"
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
                placeholder="Sort"
                frameworks={orderingOptions}
                value={ordering}
                onValueChange={(v) => {
                  setOrdering(v)
                  setPage(1)
                }}
              />
            ),
          },
          {
            component: (
              <div className="flex items-center gap-2">
                <Switch
                  id="stock-low-only"
                  checked={lowOnly}
                  onCheckedChange={(v) => {
                    setLowOnly(v)
                    setPage(1)
                  }}
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
        data={items}
        isLoading={isFetchingList}
        error={error}
        onRetry={load}
        manualPagination
        pageSize={PAGE_SIZE}
        pageIndex={page - 1}
        pageCount={Math.max(1, Math.ceil(totalItems / PAGE_SIZE))}
        totalCount={totalItems}
        onPageChange={(i) => setPage(i + 1)}
        emptyIcon={Package}
        emptyTitle="No stock items"
        emptyDescription="Nothing matches these filters."
        minWidth="1060px"
        columnWidths={["260px", "170px", "90px", "90px", "100px", "130px", "110px", "130px"]}
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
      <QuickProductDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        initialCode={lookup?.found === false ? lookup.query : ""}
        onCreated={(res) => {
          setLookup(res)
          if (res.found) setLookupCode(res.sku)
        }}
      />
    </div>
  )
}

export default StockOverview
