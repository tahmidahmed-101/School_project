import { useCallback, useEffect, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { History, Layers, PlusIcon, Wand2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DataTable } from "@/components/common/data-table"
import { StatusBadge } from "@/components/common/StatusBadge"
import { TableActions } from "@/components/common/TableActions"
import { MoneyCell } from "@/components/common/cells"
import { FormDialog } from "@/components/common/FormDialog"
import { MoneyField, TextField } from "@/components/common/form-fields"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency } from "@/lib/format"
import { splitList } from "@/lib/importLookup"

import { deleteVariant, generateVariants, listProductVariants, updateVariant } from "../api"
import type { ProductVariant } from "../types"
import { VariantOptionsCell, VariantStockCell } from "./VariantCells"
import { VariantFormDialog } from "./VariantFormDialog"

const PAGE_SIZE = 25

interface Props {
  productId: string
  categoryId: string
  productType: string
  canManage: boolean
  canViewInventory: boolean
  /** Called after any variant change so the parent can refresh product totals. */
  onChanged: () => void
}

export function ProductVariantsSection({ productId, categoryId, productType, canManage, canViewInventory, onChanged }: Props) {
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [editing, setEditing] = useState<ProductVariant | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const res = await listProductVariants(productId, { page, page_size: PAGE_SIZE })
        if (cancelled) return
        setVariants(res.items)
        setTotal(res.meta.count)
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [productId, page, reloadKey])

  const reload = useCallback(() => {
    setIsLoading(true)
    setReloadKey((k) => k + 1)
  }, [])

  const afterChange = () => {
    reload()
    onChanged()
  }

  const columns: ColumnDef<ProductVariant>[] = [
    {
      accessorKey: "sku",
      header: "SKU",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-mono text-sm">{row.original.sku}</div>
          {row.original.barcode && (
            <div className="truncate text-xs text-muted-foreground">{row.original.barcode}</div>
          )}
        </div>
      ),
    },
    {
      id: "options",
      header: "OPTIONS",
      cell: ({ row }) => <VariantOptionsCell variant={row.original} />,
    },
    {
      id: "price",
      header: "PRICE",
      cell: ({ row }) => (
        <div className="text-sm">
          <span className="font-semibold">{formatCurrency(row.original.effective_price)}</span>
          {row.original.effective_price !== row.original.price && (
            <span className="ml-1.5 text-xs text-muted-foreground line-through">
              {formatCurrency(row.original.price)}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "cost_price",
      header: "COST",
      cell: ({ row }) => <MoneyCell value={row.original.cost_price} className="text-muted-foreground" />,
    },
    {
      accessorKey: "stock",
      header: "AVAILABLE",
      cell: ({ row }) => <VariantStockCell variant={row.original} showLow />,
    },
    {
      id: "status",
      header: "STATUS",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={row.original.is_active ? "active" : "inactive"} />
          {row.original.is_preorder_active && <StatusBadge status="pre-order" tone="info" />}
        </div>
      ),
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => (
        <TableActions
          itemName={row.original.sku}
          actions={
            canViewInventory
              ? [
                  {
                    label: "Stock ledger",
                    icon: History,
                    to: `/inventory/ledger?variant_id=${row.original.id}&sku=${encodeURIComponent(row.original.sku)}`,
                  },
                ]
              : []
          }
          onEdit={
            canManage
              ? () => {
                  setEditing(row.original)
                  setFormOpen(true)
                }
              : undefined
          }
          onDelete={
            canManage
              ? async () => {
                  try {
                    await deleteVariant(row.original.id)
                    toast.success(`${row.original.sku} deactivated`)
                    afterChange()
                  } catch (err) {
                    toast.error(getApiErrorMessage(err, "Failed to delete variant"))
                  }
                }
              : undefined
          }
        />
      ),
    },
  ]

  return (
    <Card>
      {/* Phones stack the buttons under the heading; beside it they squeeze the text into a sliver. */}
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <CardTitle className="flex items-center gap-2">
            <Layers className="size-4" /> Variants
          </CardTitle>
          <CardDescription>
            {productType === "simple"
              ? "A simple product sells as a single SKU."
              : "Each colour/size combination is its own SKU with its own stock."}
          </CardDescription>
        </div>
        {canManage && (
          <div className="flex w-full gap-2 sm:w-auto sm:shrink-0 [&>button]:flex-1 sm:[&>button]:flex-none">
            {productType === "variant" && (
              <Button variant="outline" size="sm" onClick={() => setGenerateOpen(true)}>
                <Wand2 /> Generate
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <PlusIcon /> Add variant
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <DataTable
          surface="card"
          columns={columns}
          bulk={
            canManage
              ? {
                  noun: "variant",
                  deleteRow: (v) => deleteVariant(v.id),
                  activate: (rows) => Promise.all(rows.map((v) => updateVariant(v.id, { is_active: true }))),
                  deactivate: (rows) => Promise.all(rows.map((v) => updateVariant(v.id, { is_active: false }))),
                  onDone: afterChange,
                }
              : undefined
          }
          data={variants}
          isLoading={isLoading}
          error={error}
          onRetry={reload}
          manualPagination
          pageSize={PAGE_SIZE}
          pageIndex={page - 1}
          pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          totalCount={total}
          onPageChange={(i) => {
            setIsLoading(true)
            setPage(i + 1)
          }}
          showPagination={total > PAGE_SIZE}
          emptyIcon={Layers}
          emptyTitle="No variants yet"
          emptyDescription="Add a variant (or set a price on the product) to make it sellable."
          minWidth="860px"
          columnWidths={["180px", "130px", "150px", "110px", "110px", "150px", "80px"]}
          unlabelledColumns={["actions"]}
        />
      </CardContent>

      <VariantFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        productId={productId}
        categoryId={categoryId}
        variant={editing}
        onSaved={afterChange}
      />
      <GenerateVariantsDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        productId={productId}
        onDone={afterChange}
      />
    </Card>
  )
}

function GenerateVariantsDialog({
  open,
  onOpenChange,
  productId,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  productId: string
  onDone: () => void
}) {
  const [colors, setColors] = useState("")
  const [sizes, setSizes] = useState("")
  const [price, setPrice] = useState("")
  const [costPrice, setCostPrice] = useState("")
  const [busy, setBusy] = useState(false)

  const colorList = splitList(colors, true)
  const sizeList = splitList(sizes, true)
  const combos = Math.max(colorList.length, 1) * Math.max(sizeList.length, 1)
  const priceValid = /^\d+(\.\d{1,2})?$/.test(price.trim())
  const costValid = costPrice.trim() === "" || /^\d+(\.\d{1,2})?$/.test(costPrice.trim())
  const canSubmit = (colorList.length > 0 || sizeList.length > 0) && priceValid && costValid && !busy

  const submit = async () => {
    setBusy(true)
    try {
      const res = await generateVariants(productId, {
        colors: colorList,
        sizes: sizeList,
        price: price.trim(),
        ...(costPrice.trim() ? { cost_price: costPrice.trim() } : {}),
      })
      toast.success(
        `${res.created.length} created, ${res.skipped_existing.length} already existed` +
          (res.stale.length ? `, ${res.stale.length} no longer in the matrix` : "")
      )
      onDone()
      onOpenChange(false)
      setColors("")
      setSizes("")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to generate variants"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Generate variants"
      description="Creates one SKU for every colour × size combination. Existing combinations are skipped."
      onSubmit={(e) => {
        e.preventDefault()
        if (canSubmit) void submit()
      }}
      submitting={busy}
      submitLabel="Generate"
      submitDisabled={!canSubmit}
    >
      <TextField
        label="Colours"
        id="gen-colors"
        value={colors}
        onChange={(e) => setColors(e.target.value)}
        placeholder="Black, White, Navy"
        description="Comma separated."
      />
      <TextField
        label="Sizes"
        id="gen-sizes"
        value={sizes}
        onChange={(e) => setSizes(e.target.value)}
        placeholder="S, M, L, XL"
        description="Comma separated."
      />
      <div className="grid grid-cols-2 gap-4">
        <MoneyField
          label="Price"
          showCurrency
          id="gen-price"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0.00"
        />
        <MoneyField
          label="Cost price"
          id="gen-cost"
          value={costPrice}
          onChange={(e) => setCostPrice(e.target.value)}
          placeholder="0.00"
        />
      </div>
      {(colorList.length > 0 || sizeList.length > 0) && (
        <p className="text-sm text-muted-foreground">
          Up to <span className="font-medium text-foreground">{combos}</span> variant{combos === 1 ? "" : "s"} will be
          generated.
        </p>
      )}
    </FormDialog>
  )
}
