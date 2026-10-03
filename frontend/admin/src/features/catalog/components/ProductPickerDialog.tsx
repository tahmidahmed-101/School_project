import { useEffect, useState } from "react"
import { Loader2, Package, Search } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useDebounced } from "@/hooks/use-debounced"

import { searchProducts } from "../api"
import type { Product } from "../types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  onPick: (product: Product) => void
}

/** Search-and-pick dialog over /admin/catalog/products/ (bundles excluded: they have no variants of their own). */
export function ProductPickerDialog({ open, onOpenChange, title, description, onPick }: Props) {
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Product[]>([])
  const debouncedQuery = useDebounced(query.trim(), 250)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const items = await searchProducts(debouncedQuery)
        if (!cancelled) setResults(items.filter((p) => p.product_type !== "bundle"))
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [open, debouncedQuery])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            aria-label="Search products"
            placeholder="Search products by name…"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loading && (
            <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {results.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => onPick(product)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
              >
                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {product.primary_image ? (
                    <img src={product.primary_image} alt="" className="size-full object-cover" />
                  ) : (
                    <Package className="size-4 text-muted-foreground" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{product.name}</span>
                  <span className="block text-xs capitalize text-muted-foreground">
                    {product.product_type} · {product.variants.length} variant{product.variants.length === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {!loading && results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No products found.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
