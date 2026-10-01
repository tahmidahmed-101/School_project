import { useEffect, useRef, useState } from "react"
import { Loader2, Package, Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/format"
import { searchVariants } from "../api"
import type { ProductVariant } from "../types"

export interface PickedVariant {
  id: string
  sku: string
  product_name: string
  price?: string
  stock?: number
}

interface VariantPickerProps {
  value: PickedVariant | null
  onChange: (variant: PickedVariant | null) => void
  placeholder?: string
  id?: string
  /** Extra query params for /admin/catalog/variants/ (e.g. { is_active: true }). */
  filters?: Record<string, unknown>
  excludeIds?: string[]
  className?: string
}

/** Server-backed SKU / barcode / product-name search over /admin/catalog/variants/. */
export function VariantPicker({
  value,
  onChange,
  placeholder = "Search SKU, barcode or product…",
  id,
  filters,
  excludeIds,
  className,
}: VariantPickerProps) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ProductVariant[]>([])
  const boxRef = useRef<HTMLDivElement>(null)
  const filtersKey = JSON.stringify(filters ?? {})

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const handle = setTimeout(async () => {
      setLoading(true)
      try {
        const items = await searchVariants(query.trim(), JSON.parse(filtersKey))
        if (!cancelled) setResults(items)
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query, open, filtersKey])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  if (value) {
    return (
      <div
        className={cn(
          "flex h-9 items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 text-sm",
          className
        )}
      >
        <span className="min-w-0 truncate">
          <span className="font-medium">{value.product_name}</span>{" "}
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
      {open && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-md">
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
                      onChange({
                        id: v.id,
                        sku: v.sku,
                        product_name: v.product_name,
                        price: v.price,
                        stock: v.stock,
                      })
                      setOpen(false)
                      setQuery("")
                    }}
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted">
                      {v.primary_image ? (
                        <img src={v.primary_image} alt="" className="size-full object-cover" />
                      ) : (
                        <Package className="size-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {v.product_name}
                        {(v.color || v.size) && (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            · {[v.color, v.size].filter(Boolean).join(" / ")}
                          </span>
                        )}
                      </div>
                      <div className="truncate font-mono text-xs text-muted-foreground">{v.sku}</div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      <div>{formatCurrency(v.price)}</div>
                      <div>{v.stock} in stock</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
