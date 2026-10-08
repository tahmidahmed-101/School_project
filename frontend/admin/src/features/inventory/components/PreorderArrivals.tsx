import { useCallback, useEffect, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { ArrowDownToLine, MinusCircle, PackageCheck, ShoppingCart, SlidersHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { Combobox } from "@/components/common/ComboBox"
import { PageHeader } from "@/components/common/PageHeader"
import { ProductCell, Thumbnail } from "@/components/common/cells"
import { TableActions } from "@/components/common/TableActions"
import type { PickedVariant } from "@/components/common/VariantPicker"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import { getApiErrorMessage } from "@/lib/api/client"
import type { Option } from "@/lib/types"

import { fetchAll } from "../slices/preorderStockItemSlice"
import { allocatePreorderStock, fetchPreorderReport } from "../api"
import type { PreorderDemandRow, StockItem } from "../types"
import { useWarehouses } from "../lib/useWarehouses"
import { StockMovementDialog, type MovementMode } from "./StockMovementDialog"

const PAGE_SIZE = 25

const demandColumns: ColumnDef<PreorderDemandRow>[] = [
  {
    id: "item",
    header: "ITEM",
    cell: ({ row }) => <ProductCell name={row.original.product_name} sku={row.original.variant_sku} />,
  },
  { accessorKey: "waiting", header: "CUSTOMERS WAITING" },
  { accessorKey: "available", header: "ARRIVED, NOT SET ASIDE" },
  {
    accessorKey: "to_buy",
    header: "TO BUY",
    cell: ({ row }) => <span className="text-sm font-semibold">{row.original.to_buy}</span>,
  },
]

const PreorderArrivals = () => {
  useDocumentTitle("Pre-order arrivals")
  const dispatch = useAppDispatch()
  // The report and the allocate action live in the orders app; receiving and corrections in inventory.
  const canSeeOrders = useCan("orders.view", "orders.manage")
  const canAllocate = useCan("orders.manage")
  const canAdjust = useCan("inventory.adjust", "inventory.manage")
  const stockState = useAppSelector((s) => s.inventoryPreorderStockItems)
  const { warehouses } = useWarehouses()

  const [demand, setDemand] = useState<PreorderDemandRow[]>([])
  const [demandLoading, setDemandLoading] = useState(canSeeOrders)
  const [demandError, setDemandError] = useState<unknown>(null)
  const [demandKey, setDemandKey] = useState(0)
  const [allocating, setAllocating] = useState(false)

  const [warehouse, setWarehouse] = useState<Option | null>(null)
  const [movement, setMovement] = useState<{ mode: MovementMode; variant?: PickedVariant; warehouseId?: string } | null>(
    null
  )

  useEffect(() => {
    if (!canSeeOrders) return
    let cancelled = false
    const run = async () => {
      try {
        const report = await fetchPreorderReport()
        if (cancelled) return
        setDemand(report.demand)
        setDemandError(null)
      } catch (err) {
        if (!cancelled) setDemandError(err)
      } finally {
        if (!cancelled) setDemandLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [canSeeOrders, demandKey])

  const list = useListPage({
    fetch: (p) => dispatch(fetchAll(p)),
    state: stockState,
    pageSize: PAGE_SIZE,
    params: { kind: "preorder", warehouse_id: warehouse?.value },
  })

  const reloadDemand = useCallback(() => {
    setDemandLoading(true)
    setDemandKey((k) => k + 1)
  }, [])

  const refreshAll = () => {
    list.reload()
    reloadDemand()
  }

  const allocate = async () => {
    setAllocating(true)
    try {
      const { allocated } = await allocatePreorderStock()
      const units = allocated.reduce((sum, row) => sum + row.quantity, 0)
      toast.success(
        units > 0
          ? `${units} unit(s) set aside for ${new Set(allocated.map((row) => row.order_id)).size} order(s)`
          : "Nothing to set aside: no arrived units match a waiting order"
      )
      refreshAll()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't set arrived goods aside"))
    } finally {
      setAllocating(false)
    }
  }

  const rowVariant = (s: StockItem): PickedVariant => ({ id: s.variant_id, sku: s.variant_sku, product_name: s.product_name })

  const arrivedColumns: ColumnDef<StockItem>[] = [
    {
      id: "item",
      header: "ITEM",
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <Thumbnail src={row.original.product_image} />
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
    { accessorKey: "quantity_on_hand", header: "ARRIVED" },
    { accessorKey: "quantity_reserved", header: "SET ASIDE FOR ORDERS" },
    {
      accessorKey: "available",
      header: "NOT SET ASIDE YET",
      cell: ({ row }) => <span className="text-sm font-semibold">{row.original.available}</span>,
    },
    ...(canAdjust
      ? [
          {
            id: "actions",
            header: "ACTIONS",
            cell: ({ row }: { row: { original: StockItem } }) => {
              const s = row.original
              return (
                <TableActions
                  itemName={`${s.variant_sku} in ${s.warehouse_name}`}
                  actions={[
                    {
                      label: "Receive",
                      icon: ArrowDownToLine,
                      onSelect: () => setMovement({ mode: "intake", variant: rowVariant(s), warehouseId: s.warehouse_id }),
                    },
                    {
                      label: "Correct quantity",
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
                  ]}
                />
              )
            },
          } as ColumnDef<StockItem>,
        ]
      : []),
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Pre-order arrivals"
        actions={
          <>
            {canAdjust && (
              <Button size="action" onClick={() => setMovement({ mode: "intake" })}>
                <ArrowDownToLine className="size-5" /> Receive goods
              </Button>
            )}
            {canAllocate && (
              <Button variant="primary" size="action" disabled={allocating} onClick={allocate}>
                <PackageCheck className="size-5" /> Set aside for orders
              </Button>
            )}
          </>
        }
      />

      {canSeeOrders && (
        <Card>
          <CardHeader>
            <CardTitle>To buy</CardTitle>
            <CardDescription>
              Units customers have ordered and are still waiting for, against what has arrived and is not set aside yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              embedded
              columns={demandColumns}
              data={demand}
              showPagination={false}
              isLoading={demandLoading}
              error={demandError}
              onRetry={reloadDemand}
              emptyIcon={ShoppingCart}
              emptyTitle="Nothing to buy"
              emptyDescription="No pre-order is waiting for goods."
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Arrived</CardTitle>
          <CardDescription>
            Units received for pre-order items. "Set aside for orders" hands them to waiting orders with a paid deposit,
            oldest order first, from the default warehouse.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
            ]}
          />
          <DataTable
            embedded
            columns={arrivedColumns}
            data={stockState.data}
            {...list.tableProps}
            emptyIcon={PackageCheck}
            emptyTitle="No pre-order items"
            emptyDescription="Nothing matches these filters."
            minWidth="900px"
            unlabelledColumns={["actions"]}
          />
        </CardContent>
      </Card>

      <StockMovementDialog
        kind="preorder"
        mode={movement?.mode ?? null}
        onOpenChange={(o) => !o && setMovement(null)}
        warehouses={warehouses}
        variant={movement?.variant ?? null}
        warehouseId={movement?.warehouseId ?? null}
        onDone={refreshAll}
      />
    </div>
  )
}

export default PreorderArrivals
