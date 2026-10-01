import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { History, Layers, Loader2, PlusIcon, Wand2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { DataTable } from "@/components/common/data-table"
import { StatusBadge } from "@/components/common/StatusBadge"
import { TableActions } from "@/components/common/TableActions"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency } from "@/lib/format"

import { deleteVariant, generateVariants, listProductVariants } from "../api"
import type { ProductVariant } from "../types"
import { VariantFormDialog } from "./VariantFormDialog"

const PAGE_SIZE = 25

interface Props {
  productId: string
  productType: string
  canManage: boolean
  canViewInventory: boolean
  /** Called after any variant change so the parent can refresh product totals. */
  onChanged: () => void
}

export function ProductVariantsSection({ productId, productType, canManage, canViewInventory, onChanged }: Props) {
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
      cell: ({ row }) => (
        <span className="text-sm">
          {[row.original.color, row.original.size].filter(Boolean).join(" / ") || "—"}
        </span>
      ),
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
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatCurrency(row.original.cost_price)}</span>,
    },
    {
      accessorKey: "stock",
      header: "AVAILABLE",
      cell: ({ row }) => (
        <span
          className={
            row.original.stock <= 0
              ? "text-sm font-medium text-destructive"
              : row.original.is_low_stock
                ? "text-sm font-medium text-amber-600 dark:text-amber-400"
                : "text-sm"
          }
        >
          {row.original.stock}
          {row.original.is_low_stock && row.original.stock > 0 && " (low)"}
        </span>
      ),
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
      header: "ACTION",
      cell: ({ row }) => (
        <div className="flex items-center gap-1" data-no-row-click>
          {canViewInventory && (
            <Button variant="ghost" size="icon" asChild aria-label={`Stock ledger for ${row.original.sku}`}>
              <Link to={`/inventory/ledger?variant_id=${row.original.id}&sku=${encodeURIComponent(row.original.sku)}`}>
                <History className="size-4" />
              </Link>
            </Button>
          )}
          {canManage && (
            <TableActions
              itemName={row.original.sku}
              onEdit={() => {
                setEditing(row.original)
                setFormOpen(true)
              }}
              onDelete={async () => {
                try {
                  await deleteVariant(row.original.id)
                  toast.success(`${row.original.sku} deactivated`)
                  afterChange()
                } catch (err) {
                  toast.error(getApiErrorMessage(err, "Failed to delete variant"))
                }
              }}
            />
          )}
        </div>
      ),
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="size-4" /> Variants
        </CardTitle>
        <CardDescription>
          {productType === "simple"
            ? "A simple product sells as a single SKU."
            : "Each colour/size combination is its own SKU with its own stock."}
        </CardDescription>
        {canManage && (
          <CardAction className="flex flex-wrap gap-2">
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
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
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
          columnWidths={["180px", "130px", "150px", "110px", "110px", "150px", "140px"]}
          unlabelledColumns={["actions"]}
        />
      </CardContent>

      <VariantFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        productId={productId}
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

const splitList = (raw: string) =>
  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

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

  const colorList = splitList(colors)
  const sizeList = splitList(sizes)
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate variants</DialogTitle>
          <DialogDescription>
            Creates one SKU for every colour × size combination. Existing combinations are skipped.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="gen-colors">Colours</FieldLabel>
            <FieldContent>
              <Input id="gen-colors" value={colors} onChange={(e) => setColors(e.target.value)} placeholder="Black, White, Navy" />
              <FieldDescription>Comma separated.</FieldDescription>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="gen-sizes">Sizes</FieldLabel>
            <FieldContent>
              <Input id="gen-sizes" value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="S, M, L, XL" />
              <FieldDescription>Comma separated.</FieldDescription>
            </FieldContent>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="gen-price">Price (BDT)</FieldLabel>
              <FieldContent>
                <Input id="gen-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="gen-cost">Cost price</FieldLabel>
              <FieldContent>
                <Input id="gen-cost" inputMode="decimal" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="0.00" />
              </FieldContent>
            </Field>
          </div>
          {(colorList.length > 0 || sizeList.length > 0) && (
            <p className="text-sm text-muted-foreground">
              Up to <span className="font-medium text-foreground">{combos}</span> variant{combos === 1 ? "" : "s"} will be
              generated.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
