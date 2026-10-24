import { useRef, useState } from "react"
import { ChevronsUpDown, ImageOff, Loader2, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useDebouncedSearch } from "@/hooks/use-debounced-search"
import { useKind, type Kind } from "@/hooks/use-kind"
import { api } from "@/lib/api/client"
import { unwrapList } from "@/lib/api/envelope"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Thumbnail } from "./cells"

export interface PickedVariant {
  id: string
  sku: string
  product_name: string
  /** Product name with the variant's options, e.g. "Tee — Red / M". */
  label?: string
  price?: string
  cost_price?: string | null
  stock?: number
}

/** The fields of the catalog ProductVariantSerializer the picker reads. */
interface VariantHit {
  id: string
  sku: string
  product_name: string
  product_code: string
  /** "Red / M"; "" on a product without options. */
  title?: string
  price: string
  cost_price: string | null
  stock: number
  primary_image: string | null
}

interface InlineProps {
  variant?: "inline"
  value: PickedVariant | null
  onChange: (variant: PickedVariant | null) => void
  placeholder?: string
  id?: string
  /** Extra query params for /admin/catalog/variants/ (e.g. { is_active: true }). */
  filters?: Record<string, unknown>
  excludeIds?: string[]
  className?: string
}

interface ComboboxProps {
  variant: "combobox"
  value: PickedVariant | null
  onChange: (variant: PickedVariant) => void
  filters?: Record<string, unknown>
  invalid?: boolean
  id?: string
}

const variantLabel = (v: VariantHit) =>
  [v.product_name, v.title].filter(Boolean).join(" — ")

const toPicked = (v: VariantHit): PickedVariant => ({
  id: v.id,
  sku: v.sku,
  product_name: v.product_name,
  label: variantLabel(v),
  price: v.price,
  cost_price: v.cost_price,
  stock: v.stock,
})

/** The half the listed items belong to: the caller's `category_type` filter, else the page's half. */
function useListedKind(filters: Record<string, unknown> | undefined): Kind {
  const pageKind = useKind()
  const asked = filters?.category_type
  return asked === "stock" || asked === "preorder" ? asked : pageKind
}

const onHandLabel = (kind: Kind, count: number) => (kind === "preorder" ? `${count} arrived` : `${count} in stock`)

async function fetchVariants(params: Record<string, unknown>, signal: AbortSignal) {
  const res = await api.get("/admin/catalog/variants/", { params: { page: 1, page_size: 20, ...params }, signal })
  return unwrapList<VariantHit>(res.data, 1, 20).items
}

/** Server-backed SKU / barcode / product-name / product-code search over /admin/catalog/variants/. */
export function VariantPicker(props: InlineProps | ComboboxProps) {
  return props.variant === "combobox" ? <ComboboxVariantPicker {...props} /> : <InlineVariantPicker {...props} />
}

function InlineVariantPicker({
  value,
  onChange,
  placeholder = "Search SKU, barcode, product or code…",
  id,
  filters,
  excludeIds,
  className,
}: InlineProps) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const kind = useListedKind(filters)
  const filtersKey = JSON.stringify(filters ?? {})
  const { results, loading } = useDebouncedSearch({
    query: query.trim(),
    delay: 250,
    enabled: open,
    search: (search, signal) => fetchVariants({ search, ...JSON.parse(filtersKey) }, signal),
    refetchKey: filtersKey,
  })

  if (value) {
    return (
      <div
        className={cn(
          // Same height and padding as <Input>, so picking a variant does not shrink the field.
          "flex h-11 items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-4 text-sm",
          className
        )}
      >
        <span className="min-w-0 truncate">
          <span className="font-medium">{value.label ?? value.product_name}</span>{" "}
          <span className="text-muted-foreground font-mono text-xs">{value.sku}</span>
        </span>
        <button
          type="button"
          aria-label="Clear selected variant"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => onChange(null)}
        >
          <X className="size-4" />
        </button>
      </div>
    )
  }

  const visible = results.filter((r) => !excludeIds?.includes(r.id))

  return (
    // The suggestions render in a popover (a portal on <body>), so a card or dialog that clips
    // its overflow can't cut them off.
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={boxRef} className={cn("relative", className)}>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={id}
            value={query}
            placeholder={placeholder}
            className="pl-9"
            autoComplete="off"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        // Typing continues in the search box; the list must not take focus.
        onOpenAutoFocus={(e) => e.preventDefault()}
        // A click back in the search box is not "outside".
        onInteractOutside={(e) => {
          if (boxRef.current?.contains(e.target as Node)) e.preventDefault()
        }}
        className="max-h-72 w-(--radix-popover-trigger-width) overflow-y-auto p-0"
      >
        <div>
          {loading && visible.length === 0 ? (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Searching…
            </div>
          ) : visible.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No variants found.</div>
          ) : (
            <ul role="listbox">
              {visible.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      onChange(toPicked(v))
                      setOpen(false)
                      setQuery("")
                    }}
                  >
                    <Thumbnail src={v.primary_image} className="size-8 rounded" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {v.product_name}
                        {v.title && <span className="text-muted-foreground font-normal"> · {v.title}</span>}
                      </div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        #{v.product_code} · {v.sku}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      <div>{formatCurrency(v.price)}</div>
                      <div>{onHandLabel(kind, v.stock)}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ComboboxVariantPicker({ value, onChange, filters, invalid, id }: ComboboxProps) {
  const kind = useListedKind(filters)
  const filtersKey = JSON.stringify(filters ?? {})
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const { results, loading } = useDebouncedSearch({
    query,
    enabled: open,
    search: (search, signal) => fetchVariants({ ...(search ? { search } : {}), ...JSON.parse(filtersKey) }, signal),
    refetchKey: filtersKey,
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          className="w-full justify-between font-normal h-9"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? `${value.label ?? value.product_name} (${value.sku})` : "Select product variant"}
          </span>
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(420px,90vw)] p-0" align="start">
        <div className="relative border-b border-border p-2">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SKU, product or code..."
            className="pl-8"
            aria-label="Search variants"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1" role="listbox">
          {loading && results.length === 0 ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : results.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No variants found.</p>
          ) : (
            results.map((v) => (
              <button
                key={v.id}
                type="button"
                role="option"
                aria-selected={value?.id === v.id}
                onClick={() => {
                  onChange(toPicked(v))
                  setOpen(false)
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                  value?.id === v.id && "bg-accent"
                )}
              >
                <Thumbnail src={v.primary_image} icon={ImageOff} className="rounded" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{variantLabel(v)}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    #{v.product_code} · {v.sku} · {onHandLabel(kind, v.stock)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
