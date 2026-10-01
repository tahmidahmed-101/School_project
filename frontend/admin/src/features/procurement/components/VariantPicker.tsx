import { useEffect, useState } from "react"
import { ChevronsUpDown, ImageOff, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { api } from "@/lib/api/client"
import { unwrapList } from "@/lib/api/envelope"
import { cn } from "@/lib/utils"
import type { VariantOption } from "../types"
import { useDebouncedValue } from "../hooks/useProcurement"
import { variantLabel } from "../utils"

export interface PickedVariant {
  id: string
  label: string
  sku: string
  cost_price: string | null
}

/** Searchable picker over /admin/catalog/variants/ (search by SKU, barcode or product name). */
export function VariantPicker({
  value,
  onChange,
  invalid,
  id,
}: {
  value: PickedVariant | null
  onChange: (variant: PickedVariant) => void
  invalid?: boolean
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const search = useDebouncedValue(query)
  const [results, setResults] = useState<VariantOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const run = async () => {
      setLoading(true)
      try {
        const res = await api.get("/admin/catalog/variants/", {
          params: { page: 1, page_size: 20, ...(search ? { search } : {}) },
          signal: controller.signal,
        })
        setResults(unwrapList<VariantOption>(res.data, 1, 20).items)
      } catch {
        if (!controller.signal.aborted) setResults([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    run()
    return () => controller.abort()
  }, [open, search])

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
            {value ? `${value.label} (${value.sku})` : "Select product variant"}
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
            placeholder="Search SKU or product..."
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
                  onChange({ id: v.id, label: variantLabel(v), sku: v.sku, cost_price: v.cost_price })
                  setOpen(false)
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                  value?.id === v.id && "bg-accent"
                )}
              >
                <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted">
                  {v.primary_image ? (
                    <img src={v.primary_image} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <ImageOff className="size-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{variantLabel(v)}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {v.sku} · {v.stock} in stock
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
