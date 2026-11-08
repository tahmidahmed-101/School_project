import { useEffect, useId, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { Eye, Plus, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SubmitButton } from "@/components/common/FormActions"
import { MoneyField, TextField } from "@/components/common/form-fields"
import { useMediaQuery } from "@/hooks/use-media-query"
import { getApiErrorMessage } from "@/lib/api/client"
import { AMOUNT_PATTERN, parseAmount } from "@/lib/moneyInput"
import type { Option } from "@/lib/types"
import { postBulkAdjustments } from "@/features/inventory/api"

import { fetchAllShopOptions, saveProductOptions, updateVariant } from "../api"
import type { Product, ProductOption, ProductVariant, ProductVariantPayload, ShopOption } from "../types"
import {
  adoptKnownSpelling,
  buildCombinations,
  cleanOptionText,
  combinationKey,
  combinationTitle,
  MAX_OPTIONS,
  optionTextKey,
  refusalMessage,
  settleInOrder,
} from "../lib/options"
import { savedOptionsOf } from "../lib/productKind"

/** One attribute the product varies by. `optionId` is set when the product already has it. */
interface Row {
  key: string
  optionId?: string
  name: string
  values: string[]
}

/** What is typed for one new variant in the table; blank fields fall back to the defaults above it. */
interface Override {
  price: string
  discount_price: string
  cost_price: string
  weight: string
}

const NO_OVERRIDE: Override = { price: "", discount_price: "", cost_price: "", weight: "" }
const WEIGHT = /^\d+(\.\d{1,3})?$/
const WHOLE = /^\d+$/

let lastKey = 0
const blankRow = (): Row => ({ key: `row-${(lastKey += 1)}`, name: "", values: [] })

const startRows = (options: readonly ProductOption[]): Row[] =>
  options.length > 0
    ? options.map((o) => ({ key: o.id, optionId: o.id, name: o.name, values: o.values.map((v) => v.value) }))
    : [blankRow()]

const same = (a: string, b: string) => optionTextKey(a) === optionTextKey(b)

/** The shop's attributes. A failed load just leaves the lists empty. */
function useAttributes(): ShopOption[] | null {
  const [loaded, setLoaded] = useState<ShopOption[] | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchAllShopOptions()
      .then((all) => {
        if (!cancelled) setLoaded(all)
      })
      .catch(() => {
        if (!cancelled) setLoaded([])
      })
    return () => {
      cancelled = true
    }
  }, [])
  return loaded
}

/** The values of one attribute: chips, and a dropdown of the attribute's values that also takes a typed one. */
function ValuesInput({
  label,
  values,
  locked,
  suggestions,
  disabled,
  onChange,
}: {
  label: string
  values: string[]
  /** Values the product already has; a variant may use them, so they cannot be taken out here. */
  locked: readonly string[]
  suggestions: string[]
  disabled: boolean
  onChange: (next: string[]) => void
}) {
  const anchor = useComboboxAnchor()
  const [typed, setTyped] = useState("")
  // Enter picks the highlighted item; with nothing highlighted it adds what is typed as a new value.
  const highlighted = useRef(false)
  const isLocked = (value: string) => locked.some((l) => same(l, value))
  const items = [...suggestions, ...values.filter((v) => !suggestions.some((s) => same(s, v)))]

  const addTyped = () => {
    const value = adoptKnownSpelling(typed, items)
    if (!value) return
    if (!values.some((v) => same(v, value))) onChange([...values, value])
    setTyped("")
  }

  return (
    <Combobox
      multiple
      items={items}
      value={values}
      // Backspace and the list can only take out values that are new here.
      onValueChange={(next: string[]) =>
        onChange([...values.filter((v) => isLocked(v) || next.includes(v)), ...next.filter((n) => !values.includes(n))])
      }
      inputValue={typed}
      onInputValueChange={(next: string) => setTyped(next)}
      onItemHighlighted={(item: string | undefined) => {
        highlighted.current = item !== undefined
      }}
      disabled={disabled}
    >
      <ComboboxChips
        ref={anchor}
        className="min-h-10 min-w-0 flex-1 border-field-border bg-field-bg px-2 focus-within:border-transparent focus-within:ring-2 focus-within:ring-primary dark:bg-field-bg"
      >
        <ComboboxValue>
          {(picked: string[]) => (
            <>
              {picked.map((value) => (
                <ComboboxChip
                  key={value}
                  showRemove={!isLocked(value)}
                  className="h-6 bg-sky-500/15 text-sm text-sky-700 dark:text-sky-300"
                >
                  {value}
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                aria-label={label}
                maxLength={50}
                className="h-7 min-w-24 px-1 text-sm text-field-text placeholder:text-field-placeholder disabled:cursor-not-allowed"
                placeholder={picked.length > 0 ? "Add another" : "Values — press Enter after each"}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return
                  // Never submit; and when no list item is highlighted, take what is typed.
                  e.preventDefault()
                  if (!highlighted.current && cleanOptionText(typed)) addTyped()
                }}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor} className="pointer-events-auto">
        <ComboboxEmpty>
          {cleanOptionText(typed) ? `Press Enter to add "${cleanOptionText(typed)}"` : "Type a value and press Enter"}
        </ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item} disabled={isLocked(item)}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

/** A narrow input of the single-variants table. */
function CellInput({
  label,
  value,
  placeholder,
  invalid,
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  invalid: boolean
  onChange: (next: string) => void
}) {
  return (
    <Input
      aria-label={label}
      inputMode="decimal"
      className="h-9 w-24 px-2 sm:w-28"
      value={value}
      placeholder={placeholder}
      aria-invalid={invalid ? true : undefined}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
    />
  )
}

/**
 * Choose the attributes a product varies by and the values of each. Preview then lists the
 * combinations that are new, with their prices, and Generate creates them as variants.
 * Mount it fresh for every opening (a new `key`).
 */
export function GenerateVariantsDialog({
  open,
  onOpenChange,
  product,
  variants,
  canSetStock,
  generate,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product
  /** The variants the product has now. */
  variants: readonly ProductVariant[]
  /** The user may adjust stock: the new variants can start with a quantity. */
  canSetStock: boolean
  /**
   * Creates the variants of the given value-id combinations at one price, then hands them to `finish`
   * before saying how it went.
   */
  generate: (
    combinations: string[][],
    pricing: { price?: string },
    finish: (created: ProductVariant[]) => Promise<void>,
  ) => Promise<void>
  /** Called when the attributes were saved, whether or not variants were made. */
  onSaved: () => void
}) {
  const id = useId()
  const isDesktop = useMediaQuery("(min-width: 640px)")
  const attributes = useAttributes()
  const saved = savedOptionsOf(product)
  const [rows, setRows] = useState<Row[]>(() => startRows(saved))
  const [price, setPrice] = useState(product.price ?? "")
  const [stock, setStock] = useState("0")
  const [skuPrefix, setSkuPrefix] = useState("")
  const [weight, setWeight] = useState("")
  const [overrides, setOverrides] = useState<Record<string, Override>>({})
  const [checked, setChecked] = useState(false)
  // The prices and the list of new variants only show once Preview is pressed.
  const [previewing, setPreviewing] = useState(false)
  const [busy, setBusy] = useState(false)

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const lockedValues = (row: Row) => saved.find((o) => o.id === row.optionId)?.values.map((v) => v.value) ?? []
  const attributeValues = (row: Row) => attributes?.find((a) => same(a.name, row.name))?.values ?? []
  const takenNames = new Set(rows.map((r) => optionTextKey(r.name)).filter(Boolean))
  const freeAttributes = (attributes ?? []).filter((a) => !takenNames.has(optionTextKey(a.name)))

  // Every combination of the chosen values. A variant that already exists keeps its values and,
  // for an attribute that is new to the product, takes the first value chosen for it.
  const ready = rows.every((r) => r.name && r.values.length > 0)
  const combinations = ready ? buildCombinations(rows.map((r) => r.values)) : []
  const existingKeys = new Set(
    variants.map((v) =>
      combinationKey(
        rows.map((r) => (v.option_values ?? []).find((ov) => ov.option_id === r.optionId)?.value ?? r.values[0] ?? ""),
      ),
    ),
  )
  const fresh = combinations.filter((c) => !existingKeys.has(combinationKey(c)))
  const optionsChanged = rows.some(
    (r) => !r.optionId || r.values.length !== (saved.find((o) => o.id === r.optionId)?.values.length ?? 0),
  )

  const overrideOf = (key: string) => overrides[key] ?? NO_OVERRIDE
  const setOverride = (key: string, patch: Partial<Override>) =>
    setOverrides((prev) => ({ ...prev, [key]: { ...(prev[key] ?? NO_OVERRIDE), ...patch } }))
  const badAmount = (value: string) => value.trim() !== "" && !AMOUNT_PATTERN.test(value.trim())
  const badWeight = (value: string) => value.trim() !== "" && !WEIGHT.test(value.trim())
  /** The discount of a row must stay under the price that row ends up with. */
  const badDiscount = (key: string) => {
    const row = overrideOf(key)
    const rowPrice = row.price.trim() || price.trim()
    const discountPaisa = parseAmount(row.discount_price)
    const pricePaisa = parseAmount(rowPrice)
    if (discountPaisa === null) return true
    return Boolean(row.discount_price.trim() && rowPrice && pricePaisa !== null && discountPaisa >= pricePaisa)
  }

  const attributeProblem = rows.some((r) => !r.name)
    ? "Choose an attribute for every row, or remove the empty row."
    : rows.some((r) => r.values.length === 0)
      ? "Add at least one value to every attribute."
      : ""
  const priceProblem =
    fresh.length === 0 ? "" : !price.trim() ? "Enter a price" : badAmount(price) ? "Enter a valid amount" : ""
  const stockProblem = canSetStock && stock.trim() !== "" && !WHOLE.test(stock.trim()) ? "Whole number" : ""
  const tableProblem = fresh.some((c) => {
    const key = combinationKey(c)
    const row = overrideOf(key)
    return badAmount(row.price) || badAmount(row.cost_price) || badWeight(row.weight) || badDiscount(key)
  })
    ? "Check the highlighted fields in the table."
    : ""
  const nothingToDo = ready && !optionsChanged && fresh.length === 0

  // The fields of one new variant: columns of the table, or lines of its card on a phone.
  const columns: {
    field: keyof Override
    label: string
    placeholder?: string
    invalid: (key: string) => boolean
  }[] = [
    { field: "price", label: "Price", placeholder: price.trim() || "0.00", invalid: (key) => badAmount(overrideOf(key).price) },
    { field: "discount_price", label: "Discount price", invalid: badDiscount },
    { field: "cost_price", label: "Cost", invalid: (key) => badAmount(overrideOf(key).cost_price) },
    { field: "weight", label: "Weight (kg)", placeholder: weight.trim(), invalid: (key) => badWeight(overrideOf(key).weight) },
  ]
  const showPreview = previewing && ready

  const preview = () => {
    setChecked(true)
    if (!attributeProblem && !nothingToDo) setPreviewing(true)
  }

  const skuFor = (combination: string[]) =>
    [skuPrefix, ...combination]
      .map((part) =>
        cleanOptionText(part)
          .replace(/[^A-Za-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
      )
      .filter(Boolean)
      .join("-")
      .toUpperCase()

  const submit = async () => {
    setChecked(true)
    if (attributeProblem || priceProblem || stockProblem || tableProblem || badWeight(weight) || nothingToDo) return
    setBusy(true)
    try {
      let current: readonly ProductOption[] = saved
      if (optionsChanged) {
        const res = await saveProductOptions(product.id, {
          options: rows.map((r) => {
            const known = saved.find((o) => o.id === r.optionId)
            return {
              ...(r.optionId ? { id: r.optionId } : {}),
              name: r.name,
              ...(!r.optionId && variants.length > 0 ? { default_value: r.values[0] } : {}),
              values: r.values.map((value) => {
                const stored = known?.values.find((v) => same(v.value, value))
                return stored ? { id: stored.id, value: stored.value } : { value }
              }),
            }
          }),
        })
        current = res.options
      }
      const targets = fresh.map((combination) => ({
        combination,
        valueIds: combination.map((value, i) => {
          const option = current.find((o) => same(o.name, rows[i].name))
          return option?.values.find((v) => same(v.value, value))?.id ?? ""
        }),
      }))

      /** Puts the single prices, weights and SKUs on the variants just made, then their opening stock. */
      const finish = async (created: ProductVariant[]) => {
        const targetOf = (variant: ProductVariant) => {
          const ids = new Set((variant.option_values ?? []).map((ov) => ov.value_id))
          return targets.find((t) => t.valueIds.every((valueId) => ids.has(valueId)))
        }
        const results = await settleInOrder(created, async (variant) => {
          const target = targetOf(variant)
          if (!target) return
          const row = overrideOf(combinationKey(target.combination))
          const payload: ProductVariantPayload = {}
          if (row.price.trim()) payload.price = row.price.trim()
          if (row.discount_price.trim()) payload.discount_price = row.discount_price.trim()
          if (row.cost_price.trim()) payload.cost_price = row.cost_price.trim()
          const kg = row.weight.trim() || weight.trim()
          if (kg) payload.weight = kg
          if (skuPrefix.trim()) payload.sku = skuFor(target.combination)
          if (Object.keys(payload).length > 0) await updateVariant(variant.id, payload)
        })
        const failed = results.find((r) => r.status === "rejected")
        if (failed) {
          toast.warning(
            `Created, but the details of some variants were not saved. ${getApiErrorMessage(failed.reason, "Edit them in the table.")}`,
          )
        }
        const quantity = canSetStock ? Number(stock.trim() || 0) : 0
        if (quantity > 0 && created.length > 0) {
          try {
            await postBulkAdjustments(
              created.map((variant) => ({ variant_id: variant.id, quantity_delta: quantity, notes: "Opening stock" })),
            )
          } catch (err) {
            toast.warning(`Created, but the stock was not added. ${getApiErrorMessage(err, "Adjust it in the table.")}`)
          }
        }
      }

      if (targets.length > 0)
        await generate(
          targets.map((t) => t.valueIds),
          { price: price.trim() },
          finish,
        )
      else toast.success("Attributes saved")
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(refusalMessage(err, "The variants could not be generated"))
    } finally {
      setBusy(false)
    }
  }

  const noAttributes = saved.length === 0 && attributes?.length === 0
  const alreadyThere = combinations.length - fresh.length

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        className="flex max-h-[90vh] w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        // The dropdowns open outside the dialog; picking from one must not close the dialog.
        onInteractOutside={(e) => {
          if ((e.target as HTMLElement | null)?.closest("[data-slot='combobox-content']")) e.preventDefault()
        }}
        // Escape closes an open dropdown first, not the dialog under it.
        onEscapeKeyDown={(e) => {
          if (document.querySelector("[data-slot='combobox-content']")) e.preventDefault()
        }}
      >
        <DialogHeader className="shrink-0 px-4 pt-5 pr-10 pb-3 text-left sm:px-6">
          <DialogTitle>Generate variants</DialogTitle>
          <DialogDescription>Choose the attributes this product varies by and the values for each.</DialogDescription>
        </DialogHeader>

        <div data-slot="generate-body" className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pt-1 pb-5 sm:px-6">
          {noAttributes ? (
            <p className="py-2 text-sm text-muted-foreground">
              There are no attributes yet. Create one, like Size or Colour, on the{" "}
              <Link to="/attributes" className="text-primary underline">
                Attributes page
              </Link>{" "}
              first.
            </p>
          ) : (
            <div className="space-y-3">
              {rows.map((row, i) => {
                const picked: Option | null = row.name ? { label: row.name, value: row.name } : null
                const items: Option[] = [
                  ...(picked ? [picked] : []),
                  ...freeAttributes.map((a) => ({ label: a.name, value: a.name })),
                ]
                return (
                  <div key={row.key} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <div className="w-full shrink-0 sm:w-48">
                      {row.optionId ? (
                        <Input aria-label={`Attribute ${i + 1}`} value={row.name} disabled className="h-10" />
                      ) : (
                        <Combobox
                          items={items}
                          itemToStringValue={(item: Option) => item.label}
                          value={picked}
                          onValueChange={(next: Option | null) =>
                            setRow(row.key, { name: next?.value ?? "", values: [] })
                          }
                        >
                          <ComboboxInput aria-label={`Attribute ${i + 1}`} placeholder="Attribute" />
                          <ComboboxContent className="pointer-events-auto">
                            <ComboboxEmpty>No attributes found.</ComboboxEmpty>
                            <ComboboxList>
                              {(item: Option) => (
                                <ComboboxItem key={item.value} value={item}>
                                  {item.label}
                                </ComboboxItem>
                              )}
                            </ComboboxList>
                          </ComboboxContent>
                        </Combobox>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <ValuesInput
                        label={`Values of attribute ${i + 1}`}
                        values={row.values}
                        locked={lockedValues(row)}
                        suggestions={attributeValues(row)}
                        disabled={!row.name}
                        onChange={(values) => setRow(row.key, { values })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-10 shrink-0 text-destructive hover:text-destructive disabled:opacity-30"
                        aria-label={`Remove attribute ${i + 1}`}
                        // An attribute the product already has stays: its variants are built on it.
                        disabled={Boolean(row.optionId) || rows.length === 1}
                        onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
              {rows.length < MAX_OPTIONS && freeAttributes.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-dashed"
                  onClick={() => setRows([...rows, blankRow()])}
                >
                  <Plus /> Add attribute
                </Button>
              )}
              <FieldError
                errors={[
                  checked && attributeProblem
                    ? { message: attributeProblem }
                    : checked && nothingToDo
                      ? {
                          message: "Every combination of these values already has a variant. Add a value to make more.",
                        }
                      : undefined,
                ]}
              />
            </div>
          )}

          {showPreview && (
            <>
              <div className="rounded-lg bg-primary/10 px-3 py-2.5 text-sm font-medium">
                New variants: {fresh.length} of {combinations.length} combination{combinations.length === 1 ? "" : "s"}.
                Already there: {alreadyThere}.
              </div>

              {fresh.length > 0 && (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <MoneyField
                      label="Price *"
                      showCurrency
                      id={`${id}-price`}
                      placeholder="0.00"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      error={checked && priceProblem ? { message: priceProblem } : undefined}
                    />
                    {canSetStock && (
                      <TextField
                        label="Stock"
                        id={`${id}-stock`}
                        inputMode="numeric"
                        value={stock}
                        onChange={(e) => setStock(e.target.value)}
                        description="Added to each new variant in the default warehouse."
                        error={stockProblem ? { message: stockProblem } : undefined}
                      />
                    )}
                    <TextField
                      label="SKU prefix"
                      id={`${id}-sku`}
                      placeholder="Optional, e.g. TS"
                      value={skuPrefix}
                      onChange={(e) => setSkuPrefix(e.target.value)}
                      description={skuPrefix.trim() ? `For example ${skuFor(fresh[0])}` : undefined}
                    />
                    <TextField
                      label="Weight (kg)"
                      id={`${id}-weight`}
                      inputMode="decimal"
                      placeholder="Optional"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      error={badWeight(weight) ? { message: "Up to 3 decimals (kg)" } : undefined}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">Change single variants (optional)</h3>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        // Back to one price for all: the single prices typed below are cleared.
                        disabled={!fresh.some((c) => overrideOf(combinationKey(c)).price)}
                        onClick={() =>
                          setOverrides((prev) =>
                            Object.fromEntries(Object.entries(prev).map(([key, row]) => [key, { ...row, price: "" }])),
                          )
                        }
                      >
                        Default price
                      </Button>
                    </div>
                    {isDesktop ? (
                      <div className="overflow-x-auto rounded-lg border border-border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Attributes</TableHead>
                              {columns.map((column) => (
                                <TableHead key={column.field}>{column.label}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {fresh.map((combination) => {
                              const key = combinationKey(combination)
                              const title = combinationTitle(combination)
                              return (
                                <TableRow key={key}>
                                  <TableCell className="font-medium break-words">{title}</TableCell>
                                  {columns.map((column) => (
                                    <TableCell key={column.field}>
                                      <CellInput
                                        label={`${column.label} of ${title}`}
                                        value={overrideOf(key)[column.field]}
                                        placeholder={column.placeholder}
                                        invalid={column.invalid(key)}
                                        onChange={(next) => setOverride(key, { [column.field]: next })}
                                      />
                                    </TableCell>
                                  ))}
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      // Phones: one card per variant, each field on its own line beside its label.
                      <div className="space-y-3">
                        {fresh.map((combination) => {
                          const key = combinationKey(combination)
                          const title = combinationTitle(combination)
                          return (
                            <div key={key} className="space-y-2 rounded-lg border border-border p-3">
                              <div className="text-sm font-semibold break-words">{title}</div>
                              {columns.map((column) => (
                                <label key={column.field} className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <span className="shrink-0">{column.label}:</span>
                                  <CellInput
                                    label={`${column.label} of ${title}`}
                                    value={overrideOf(key)[column.field]}
                                    placeholder={column.placeholder}
                                    invalid={column.invalid(key)}
                                    onChange={(next) => setOverride(key, { [column.field]: next })}
                                  />
                                </label>
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <FieldError errors={[tableProblem ? { message: tableProblem } : undefined]} />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 flex-row justify-end border-t border-border bg-popover px-4 py-3 sm:px-6">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            <X className="size-4" /> Cancel
          </Button>
          {showPreview ? (
            <SubmitButton type="button" loading={busy} disabled={nothingToDo} onClick={() => void submit()}>
              {fresh.length === 0 && optionsChanged
                ? "Save attributes"
                : `Generate ${fresh.length} variant${fresh.length === 1 ? "" : "s"}`}
            </SubmitButton>
          ) : (
            <Button type="button" disabled={noAttributes} onClick={preview}>
              <Eye className="size-4" /> Preview
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
