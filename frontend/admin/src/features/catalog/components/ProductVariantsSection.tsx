import { useCallback, useEffect, useState, type ReactNode } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { Layers, Loader2, PlusIcon, SlidersHorizontal, Sparkles, Tags, Trash2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { DataTable } from "@/components/common/data-table"
import { StatusBadge } from "@/components/common/StatusBadge"
import { TableActions } from "@/components/common/TableActions"
import { MoneyCell, TextCell, Thumbnail } from "@/components/common/cells"
import { FormDialog } from "@/components/common/FormDialog"
import { MoneyField } from "@/components/common/form-fields"
import type { PickedVariant } from "@/components/common/VariantPicker"
import { useCan } from "@/hooks/use-can"
import { useDelayedUnmount, useLastValue } from "@/hooks/use-dialog-presence"
import { getApiErrorMessage } from "@/lib/api/client"
import { AMOUNT_PATTERN, parseAmount } from "@/lib/moneyInput"
import { StockMovementDialog } from "@/features/inventory/components/StockMovementDialog"
import { useWarehouses } from "@/features/inventory/lib/useWarehouses"

import {
  bulkUpdateVariants,
  deleteVariant,
  fetchAllProductVariants,
  generateVariants,
  listCombinations,
  updateVariant,
} from "../api"
import type { Combination, Product, ProductVariant, VariantBulkUpdatePayload } from "../types"
import { refusalMessage } from "../lib/options"
import { savedOptionsOf } from "../lib/productKind"
import { VariantStockCell } from "./VariantCells"
import { VariantFormDialog } from "./VariantFormDialog"
import { GenerateVariantsDialog } from "./GenerateVariantsDialog"
import { StockDeleteDialog } from "./StockDeleteDialog"

interface Props {
  product: Product
  canManage: boolean
  /** Called after any variant change so the parent can refresh product totals. */
  onChanged: () => void
}

/** One line of the table: a combination of the product's options, created or not. */
interface Row {
  key: string
  title: string
  /** Null on a variant that matches no combination (made before the product had options). */
  valueIds: string[] | null
  created: boolean
  variant: ProductVariant | null
}


function buildRows(combinations: Combination[], variants: ProductVariant[], productName: string): Row[] {
  const byId = new Map(variants.map((v) => [v.id, v]))
  const placed = new Set<string>()
  const rows: Row[] = combinations.map((c) => {
    if (c.variant_id) placed.add(c.variant_id)
    return {
      key: c.value_ids.join("|"),
      title: c.title,
      valueIds: c.value_ids,
      created: Boolean(c.variant_id),
      variant: (c.variant_id && byId.get(c.variant_id)) || null,
    }
  })
  for (const v of variants) {
    // A product without options has one untitled variant: it goes by the product's name.
    if (!placed.has(v.id)) rows.push({ key: v.id, title: v.title || productName, valueIds: null, created: true, variant: v })
  }
  return rows
}

export function ProductVariantsSection({ product, canManage, onChanged }: Props) {
  const productId = product.id
  const hasOptions = savedOptionsOf(product).length > 0
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [combinations, setCombinations] = useState<Combination[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [editing, setEditing] = useState<ProductVariant | null>(null)
  const canAdjust = useCan("inventory.adjust", "inventory.manage")
  const { warehouses } = useWarehouses()
  const [adjusting, setAdjusting] = useState<PickedVariant | null>(null)
  const [deleting, setDeleting] = useState<ProductVariant | null>(null)
  // Kept mounted, still showing its variant, while the delete dialog animates shut.
  const deleteTarget = useLastValue(deleting)
  const deleteMounted = useDelayedUnmount(deleting !== null)
  const [formOpen, setFormOpen] = useState(false)
  const [priceOpen, setPriceOpen] = useState(false)
  // The generate dialog is mounted fresh for each opening, so it starts from the product as it is.
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generateKey, setGenerateKey] = useState(0)
  const [ticked, setTicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const [all, combos] = await Promise.all([
          fetchAllProductVariants(productId),
          hasOptions ? listCombinations(productId).then((res) => res.combinations) : Promise.resolve([]),
        ])
        if (cancelled) return
        setVariants(all)
        setCombinations(combos)
        setTicked([])
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
  }, [productId, hasOptions, reloadKey])

  const reload = useCallback(() => {
    setIsLoading(true)
    setReloadKey((k) => k + 1)
  }, [])

  const afterChange = () => {
    reload()
    onChanged()
  }

  // A product without options is sold as one item: its untitled variant holds the price and the
  // stock, and is not listed as a variant. The first combination generated takes it over.
  const single = !hasOptions && variants.length <= 1
  const rows = single ? [] : buildRows(combinations, variants, product.name)
  const missing = rows.filter((r) => !r.created)

  const openEditor = (variant: ProductVariant | null) => {
    setEditing(variant)
    setFormOpen(true)
  }

  /** Creates the given combinations, or every missing one when none are given. */
  const create = async (
    valueIds?: string[][],
    pricing: { price?: string } = {},
    finish?: (created: ProductVariant[]) => Promise<void>
  ) => {
    setBusy(true)
    try {
      const res = await generateVariants(productId, { ...(valueIds ? { combinations: valueIds } : {}), ...pricing })
      if (finish) await finish(res.created)
      const n = res.created.length
      toast.success(`${n} variant${n === 1 ? "" : "s"} created`)
      afterChange()
    } catch (err) {
      toast.error(refusalMessage(err, "The variants could not be created"))
    } finally {
      setBusy(false)
    }
  }

  const setActive = async (variant: ProductVariant, is_active: boolean) => {
    setVariants((prev) => prev.map((v) => (v.id === variant.id ? { ...v, is_active } : v)))
    try {
      await updateVariant(variant.id, { is_active })
      onChanged()
    } catch (err) {
      toast.error(refusalMessage(err, "The variant could not be updated"))
      reload()
    }
  }


  const adjust = (variant: ProductVariant) =>
    setAdjusting({ id: variant.id, sku: variant.sku, product_name: product.name })

  const actionsFor = (variant: ProductVariant) => (
    <TableActions
      itemName={variant.title || variant.sku}
      actions={
        [
          ...(canAdjust ? [{ label: "Adjust", icon: SlidersHorizontal, onSelect: () => adjust(variant) }] : []),
          // The delete dialog does its own confirming, so it is not TableActions' onDelete.
          ...(canManage
            ? [{ label: "Delete", icon: Trash2Icon, destructive: true, onSelect: () => setDeleting(variant) }]
            : []),
        ]
      }
      onEdit={canManage ? () => openEditor(variant) : undefined}
    />
  )

  /** A cell of a combination that is not created yet has nothing to show. */
  const forVariant = (row: Row, render: (variant: ProductVariant) => ReactNode) =>
    row.variant ? render(row.variant) : <TextCell value={null} />

  // The same table as the list pages; a combination that is not created yet is a row with a tick box.
  // The tick column only exists while there is a combination left to create.
  const showTicks = canManage && missing.length > 0
  const columns: ColumnDef<Row>[] = [
    ...(showTicks
      ? [
          {
            id: "tick",
            header: "",
            cell: ({ row }: { row: { original: Row } }) =>
              !row.original.created && (
                <Checkbox
                  aria-label={`Create ${row.original.title}`}
                  checked={ticked.includes(row.original.key)}
                  onCheckedChange={(on) =>
                    setTicked((prev) => (on ? [...prev, row.original.key] : prev.filter((k) => k !== row.original.key)))
                  }
                />
              ),
          } as ColumnDef<Row>,
        ]
      : []),
    {
      id: "variant",
      header: "VARIANT",
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          {row.original.variant && <Thumbnail src={row.original.variant.primary_image} className="size-9 rounded" />}
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.title}</div>
            {row.original.variant ? (
              <div className="truncate font-mono text-xs text-muted-foreground">{row.original.variant.sku}</div>
            ) : (
              !row.original.created && (
                <Badge variant="secondary" className="mt-0.5">
                  Not created
                </Badge>
              )
            )}
          </div>
        </div>
      ),
    },
    {
      id: "price",
      header: "PRICE",
      cell: ({ row }) => forVariant(row.original, (v) => <MoneyCell value={v.price} emphasis />),
    },
    {
      id: "discount_price",
      header: "DISCOUNT PRICE",
      cell: ({ row }) => forVariant(row.original, (v) => <MoneyCell value={v.discount_price} />),
    },
    {
      id: "cost",
      header: "COST",
      cell: ({ row }) =>
        forVariant(row.original, (v) => <MoneyCell value={v.cost_price} className="text-muted-foreground" />),
    },
    {
      id: "availability",
      header: "AVAILABLE",
      cell: ({ row }) => forVariant(row.original, (v) => <VariantStockCell variant={v} showLow />),
    },
    {
      id: "active",
      header: "ACTIVE",
      cell: ({ row }) =>
        forVariant(row.original, (v) =>
          canManage ? (
            <Switch
              aria-label={`${row.original.title} is active`}
              checked={v.is_active}
              onCheckedChange={(on) => void setActive(v, on)}
            />
          ) : (
            <StatusBadge status={v.is_active ? "active" : "inactive"} />
          )
        ),
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => row.original.variant && actionsFor(row.original.variant),
    },
  ]
  // VARIANT is the widest entry, so it takes whatever the others leave.
  const columnWidths = [
    ...(showTicks ? ["44px"] : []),
    "260px",
    "120px",
    "150px",
    "120px",
    "150px",
    "90px",
    "80px",
  ]

  const body = isLoading ? (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Loading variants…
    </div>
  ) : error ? (
    <div className="flex flex-wrap items-center gap-3 text-sm text-destructive">
      {getApiErrorMessage(error, "Couldn't load the variants")}
      <Button variant="outline" size="sm" onClick={reload}>
        Try again
      </Button>
    </div>
  ) : (
    <DataTable
      embedded
      columns={columns}
      data={rows}
      showPagination={false}
      minWidth="900px"
      columnWidths={columnWidths}
      unlabelledColumns={["tick", "actions"]}
      emptyTitle="No variants yet"
      emptyDescription="Generate variants to sell this product in sizes, colours or other options."
    />
  )

  return (
    <Card>
      {/* Phones stack the buttons under the heading; beside it they squeeze the text into a sliver. */}
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <CardTitle className="flex items-center gap-2">
            <Layers className="size-4" /> Variants
          </CardTitle>
          {!single && !hasOptions && (
            <CardDescription>These variants were made before options existed, so they have no option values.</CardDescription>
          )}
        </div>
        {(canManage || canAdjust) && !isLoading && !error && (
          <div className="grid w-full grid-cols-2 gap-2 max-sm:[&>button]:min-w-0 max-sm:[&>button]:gap-1 max-sm:[&>button]:px-1.5 max-sm:[&>button]:text-xs sm:flex sm:w-auto sm:shrink-0 sm:flex-wrap sm:justify-end">
            {canManage && !single && (
              <>
                {ticked.length > 0 && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void create(missing.filter((r) => ticked.includes(r.key)).map((r) => r.valueIds ?? []))
                    }
                  >
                    <PlusIcon /> Create selected ({ticked.length})
                  </Button>
                )}
                {missing.length > 0 && (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void create()}>
                    <PlusIcon /> Create all missing ({missing.length})
                  </Button>
                )}
                {variants.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setPriceOpen(true)}>
                    <Tags /> Set price for all
                  </Button>
                )}
              </>
            )}
            {canManage && (
              <Button
                size="sm"
                onClick={() => {
                  setGenerateKey((key) => key + 1)
                  setGenerateOpen(true)
                }}
              >
                <Sparkles /> Generate variants
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>{body}</CardContent>

      {deleteMounted && deleteTarget && (
        <StockDeleteDialog
          key={deleteTarget.id}
          open={deleting !== null}
          name={deleteTarget.title ? `${product.name} — ${deleteTarget.title}` : deleteTarget.sku}
          scope={{ variant_id: deleteTarget.id }}
          remove={() => deleteVariant(deleteTarget.id)}
          onDeleted={afterChange}
          onClose={() => setDeleting(null)}
          onStockChanged={afterChange}
        />
      )}
      <StockMovementDialog
        mode={adjusting ? "adjust" : null}
        onOpenChange={(open) => !open && setAdjusting(null)}
        warehouses={warehouses}
        variant={adjusting}
        productId={productId}
        onDone={afterChange}
      />
      <VariantFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        productId={productId}
        variant={editing}
        onSaved={afterChange}
      />
      <GenerateVariantsDialog
        key={generateKey}
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        product={product}
        variants={variants}
        canSetStock={canAdjust}
        generate={create}
        onSaved={afterChange}
      />
      <SetPriceDialog
        open={priceOpen}
        onOpenChange={setPriceOpen}
        productId={productId}
        count={variants.length}
        onDone={afterChange}
      />
    </Card>
  )
}

function SetPriceDialog({
  open,
  onOpenChange,
  productId,
  count,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  productId: string
  count: number
  onDone: () => void
}) {
  const [price, setPrice] = useState("")
  const [discount, setDiscount] = useState("")
  const [cost, setCost] = useState("")
  const [busy, setBusy] = useState(false)

  const typed = { price: price.trim(), discount_price: discount.trim(), cost_price: cost.trim() }
  const bad = (value: string) => (value !== "" && !AMOUNT_PATTERN.test(value) ? { message: "Enter a valid amount (max 2 decimals)" } : undefined)
  const typedPrice = parseAmount(typed.price)
  const typedDiscount = parseAmount(typed.discount_price)
  const discountTooHigh =
    typed.price !== "" && typed.discount_price !== "" && typedPrice !== null && typedDiscount !== null && typedDiscount >= typedPrice
  const anyTyped = Object.values(typed).some(Boolean)
  const canSubmit = anyTyped && !Object.values(typed).some(bad) && !discountTooHigh && !busy

  const submit = async () => {
    const payload: VariantBulkUpdatePayload = {}
    if (typed.price) payload.price = typed.price
    if (typed.discount_price) payload.discount_price = typed.discount_price
    if (typed.cost_price) payload.cost_price = typed.cost_price
    setBusy(true)
    try {
      await bulkUpdateVariants(productId, payload)
      toast.success(`Saved on ${count} variant${count === 1 ? "" : "s"}`)
      onDone()
      onOpenChange(false)
      setPrice("")
      setDiscount("")
      setCost("")
    } catch (err) {
      toast.error(refusalMessage(err, "The prices could not be saved"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Set price for all"
      description={`Fill in only what you want to change. It is saved on all ${count} variants of this product; a field left empty stays as it is.`}
      onSubmit={(e) => {
        e.preventDefault()
        if (canSubmit) void submit()
      }}
      submitting={busy}
      submitLabel="Save for all"
      submitDisabled={!canSubmit}
    >
      <MoneyField
        label="Price"
        showCurrency
        id="all-price"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="Leave as it is"
        error={bad(typed.price)}
      />
      <MoneyField
        label="Discount price"
        id="all-discount"
        value={discount}
        onChange={(e) => setDiscount(e.target.value)}
        placeholder="Leave as it is"
        error={bad(typed.discount_price) ?? (discountTooHigh ? { message: "Must be lower than the price" } : undefined)}
      />
      <MoneyField
        label="Cost price"
        id="all-cost"
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        placeholder="Leave as it is"
        error={bad(typed.cost_price)}
      />
    </FormDialog>
  )
}
