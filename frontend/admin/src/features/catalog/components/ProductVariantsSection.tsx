import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { History, Layers, Loader2, PencilIcon, PlusIcon, Tags } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusBadge } from "@/components/common/StatusBadge"
import { TableActions } from "@/components/common/TableActions"
import { MoneyCell } from "@/components/common/cells"
import { FormDialog } from "@/components/common/FormDialog"
import { MoneyField } from "@/components/common/form-fields"
import type { Kind } from "@/hooks/use-kind"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency } from "@/lib/format"
import { toPaisa } from "@/lib/money"

import {
  bulkUpdateVariants,
  deleteVariant,
  fetchAllProductVariants,
  generateVariants,
  listCombinations,
  updateVariant,
} from "../api"
import type { Combination, Product, ProductVariant, ProductVariantPayload, VariantBulkUpdatePayload } from "../types"
import { refusalMessage } from "../lib/options"
import { savedOptionsOf } from "../lib/useOptionDrafts"
import { VariantOrderingCell, VariantStockCell } from "./VariantCells"
import { VariantFormDialog } from "./VariantFormDialog"

interface Props {
  product: Product
  /** The product's kind: a stock product shows stock and discount, a pre-order one its ordering window. */
  kind: Kind
  canManage: boolean
  canViewInventory: boolean
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

const AMOUNT = /^\d+(\.\d{1,2})?$/

/** A new pre-order variant opens and closes for ordering together with its siblings. */
const orderingWindowOf = (sibling: ProductVariant): ProductVariantPayload => ({
  is_preorder_enabled: true,
  preorder_price: sibling.preorder_price,
  preorder_start_date: sibling.preorder_start_date,
  preorder_end_date: sibling.preorder_end_date,
  release_date: sibling.release_date,
  preorder_stock_limit: sibling.preorder_stock_limit,
})

function buildRows(combinations: Combination[], variants: ProductVariant[]): Row[] {
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
    if (!placed.has(v.id)) rows.push({ key: v.id, title: v.title || v.sku, valueIds: null, created: true, variant: v })
  }
  return rows
}

export function ProductVariantsSection({ product, kind, canManage, canViewInventory, onChanged }: Props) {
  const isStock = kind === "stock"
  const productId = product.id
  const hasOptions = savedOptionsOf(product).length > 0
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [combinations, setCombinations] = useState<Combination[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [editing, setEditing] = useState<ProductVariant | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [priceOpen, setPriceOpen] = useState(false)
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

  const rows = buildRows(combinations, variants)
  const missing = rows.filter((r) => !r.created)
  const single = !hasOptions && variants.length <= 1

  const openEditor = (variant: ProductVariant | null) => {
    setEditing(variant)
    setFormOpen(true)
  }

  /** Creates the given combinations, or every missing one when none are given. */
  const create = async (valueIds?: string[][]) => {
    setBusy(true)
    try {
      const res = await generateVariants(productId, valueIds ? { combinations: valueIds } : {})
      const sibling = variants.find((v) => v.is_preorder_enabled)
      if (!isStock && sibling) {
        const results = await Promise.allSettled(res.created.map((v) => updateVariant(v.id, orderingWindowOf(sibling))))
        if (results.some((r) => r.status === "rejected")) {
          toast.warning("Created, but the ordering dates could not be copied to every new variant. Edit them to set the dates.")
        }
      }
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

  const remove = async (variant: ProductVariant) => {
    try {
      await deleteVariant(variant.id)
      toast.success(`${variant.title || variant.sku} deleted`)
      afterChange()
    } catch (err) {
      toast.error(refusalMessage(err, "The variant could not be deleted"))
    }
  }

  const actionsFor = (variant: ProductVariant) => (
    <TableActions
      itemName={variant.title || variant.sku}
      actions={
        isStock && canViewInventory
          ? [
              {
                label: "Stock ledger",
                icon: History,
                to: `/inventory/ledger?variant_id=${variant.id}&sku=${encodeURIComponent(variant.sku)}`,
              },
            ]
          : []
      }
      onEdit={canManage ? () => openEditor(variant) : undefined}
      onDelete={canManage && !single ? () => remove(variant) : undefined}
    />
  )

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
  ) : single ? (
    <SingleVariant
      variant={variants[0] ?? null}
      isStock={isStock}
      onAdd={canManage ? () => openEditor(null) : undefined}
    />
  ) : (
    <Table className="min-w-[760px]">
      <TableHeader>
        <TableRow>
          {canManage && <TableHead className="w-10" />}
          <TableHead>Variant</TableHead>
          <TableHead>Price</TableHead>
          {isStock && <TableHead>Discount price</TableHead>}
          <TableHead>Cost</TableHead>
          <TableHead>{isStock ? "Available" : "Ordering"}</TableHead>
          <TableHead>Active</TableHead>
          <TableHead className="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const v = row.variant
          return (
            <TableRow key={row.key}>
              {canManage && (
                <TableCell>
                  {!row.created && (
                    <Checkbox
                      aria-label={`Create ${row.title}`}
                      checked={ticked.includes(row.key)}
                      onCheckedChange={(on) =>
                        setTicked((prev) => (on ? [...prev, row.key] : prev.filter((k) => k !== row.key)))
                      }
                    />
                  )}
                </TableCell>
              )}
              <TableCell>
                <div className="font-medium">{row.title}</div>
                {v && <div className="font-mono text-xs text-muted-foreground">{v.sku}</div>}
              </TableCell>
              {v ? (
                <>
                  <TableCell>
                    <MoneyCell value={v.price} emphasis />
                  </TableCell>
                  {isStock && (
                    <TableCell>
                      <MoneyCell value={v.discount_price} />
                    </TableCell>
                  )}
                  <TableCell>
                    <MoneyCell value={v.cost_price} className="text-muted-foreground" />
                  </TableCell>
                  <TableCell>
                    {isStock ? <VariantStockCell variant={v} showLow /> : <VariantOrderingCell variant={v} />}
                  </TableCell>
                  <TableCell>
                    {canManage ? (
                      <Switch
                        aria-label={`${row.title} is active`}
                        checked={v.is_active}
                        onCheckedChange={(on) => void setActive(v, on)}
                      />
                    ) : (
                      <StatusBadge status={v.is_active ? "active" : "inactive"} />
                    )}
                  </TableCell>
                  <TableCell>{actionsFor(v)}</TableCell>
                </>
              ) : (
                <TableCell colSpan={isStock ? 6 : 5}>
                  {!row.created && <Badge variant="secondary">Not created</Badge>}
                </TableCell>
              )}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )

  const onlyVariant = single ? (variants[0] ?? null) : null

  return (
    <Card>
      {/* Phones stack the buttons under the heading; beside it they squeeze the text into a sliver. */}
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <CardTitle className="flex items-center gap-2">
            <Layers className="size-4" /> {single ? (isStock ? "Price and stock" : "Price and ordering") : "Variants"}
          </CardTitle>
          <CardDescription>
            {single
              ? "This product has no options, so it sells as one item. To sell it in sizes or colours, switch on options under Edit product."
              : hasOptions
                ? "Every combination of this product's options. Tick the ones that are not created yet to start selling them; they begin at the price of the first variant."
                : "These variants were made before options existed. Add options under Edit product to describe them."}
          </CardDescription>
        </div>
        {canManage && !isLoading && !error && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
            {onlyVariant && (
              <>
                {isStock && canViewInventory && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/inventory/ledger?variant_id=${onlyVariant.id}&sku=${encodeURIComponent(onlyVariant.sku)}`}>
                      <History /> Stock ledger
                    </Link>
                  </Button>
                )}
                <Button size="sm" onClick={() => openEditor(onlyVariant)}>
                  <PencilIcon /> Edit
                </Button>
              </>
            )}
            {!single && (
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
          </div>
        )}
      </CardHeader>
      <CardContent>{body}</CardContent>

      <VariantFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        kind={kind}
        productId={productId}
        variant={editing}
        sibling={variants[0]}
        onSaved={afterChange}
      />
      <SetPriceDialog
        open={priceOpen}
        onOpenChange={setPriceOpen}
        productId={productId}
        isStock={isStock}
        count={variants.length}
        onDone={afterChange}
      />
    </Card>
  )
}

/** A product without options: the fields of its one variant, without a table. */
function SingleVariant({
  variant,
  isStock,
  onAdd,
}: {
  variant: ProductVariant | null
  isStock: boolean
  onAdd?: () => void
}) {
  if (!variant) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        This product has no price yet, so it cannot be sold.
        {onAdd && (
          <Button size="sm" onClick={onAdd}>
            <PlusIcon /> Set price
          </Button>
        )}
      </div>
    )
  }
  const cells: [string, ReactNode][] = [
    ["SKU", <span className="break-all font-mono">{variant.sku}</span>],
    ["Price", <span className="font-semibold">{formatCurrency(variant.price)}</span>],
    ...(isStock
      ? ([["Discount price", variant.discount_price ? formatCurrency(variant.discount_price) : "—"]] as [string, ReactNode][])
      : []),
    ["Cost", formatCurrency(variant.cost_price)],
    isStock
      ? ["Available", <VariantStockCell variant={variant} showLow />]
      : ["Ordering", <VariantOrderingCell variant={variant} />],
    ["Status", <StatusBadge status={variant.is_active ? "active" : "inactive"} />],
  ]
  return (
    <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
      {cells.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function SetPriceDialog({
  open,
  onOpenChange,
  productId,
  isStock,
  count,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  productId: string
  isStock: boolean
  count: number
  onDone: () => void
}) {
  const [price, setPrice] = useState("")
  const [discount, setDiscount] = useState("")
  const [cost, setCost] = useState("")
  const [busy, setBusy] = useState(false)

  const typed = { price: price.trim(), discount_price: isStock ? discount.trim() : "", cost_price: cost.trim() }
  const bad = (value: string) => (value !== "" && !AMOUNT.test(value) ? { message: "Enter a valid amount (max 2 decimals)" } : undefined)
  const discountTooHigh =
    typed.price !== "" && typed.discount_price !== "" && toPaisa(typed.discount_price) >= toPaisa(typed.price)
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
      {isStock && (
        <MoneyField
          label="Discount price"
          id="all-discount"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
          placeholder="Leave as it is"
          error={bad(typed.discount_price) ?? (discountTooHigh ? { message: "Must be lower than the price" } : undefined)}
        />
      )}
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
