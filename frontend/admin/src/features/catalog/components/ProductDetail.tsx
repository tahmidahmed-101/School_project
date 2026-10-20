import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Boxes, Edit, ListChecks, Package, RotateCcw, ScrollText } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { DetailPageState } from "@/components/common/DetailPageState"
import { PageHeader } from "@/components/common/PageHeader"
import { ActiveStatusBadge } from "@/components/common/cells"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { useKindHint, useRecordKind } from "@/hooks/use-kind"
import { getApiErrorMessage } from "@/lib/api/client"
import { resolveDetailState } from "@/lib/detailState"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

import { fetchSingle } from "../slices/productSlice"
import { fetchBrand, restoreProduct } from "../api"
import type { Product } from "../types"
import { productKind, productListPath } from "../lib/productKind"
import { useCategoryOptions } from "../lib/useCategoryOptions"
import { savedOptionsOf } from "../lib/productKind"
import { ProductVariantsSection } from "./ProductVariantsSection"
import { ProductImagesSection } from "./ProductImagesSection"

/** The product's main photo; the placeholder icon stands in when there is none or it fails to load. */
function ProductPhoto({ src, name }: { src: string | null; name: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = src && failedSrc !== src
  return (
    <div className="flex aspect-square w-full max-w-44 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
      {showImage ? (
        <img src={src} alt={name} className="size-full object-cover" onError={() => setFailedSrc(src)} />
      ) : (
        <Package className="size-12 text-muted-foreground/40" aria-label="No photo" />
      )}
    </div>
  )
}

/** One labelled figure (price, cost, stock, pre-order window...). */
function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-base font-semibold tabular-nums">{children}</dd>
    </div>
  )
}

/** One labelled fact in the details row (category, brand, slug). */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{children}</dd>
    </div>
  )
}

const ProductDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = useCan("catalog.manage")
  const { singleData, singleStatus, singleError } = useAppSelector((s) => s.products)
  const product = singleData as Product | null
  const { nameById, categories, isLoading: categoriesLoading } = useCategoryOptions()

  useDocumentTitle(product?.name ? `${product.name} — Product` : "Product Details")

  const refresh = useCallback(() => {
    if (id) dispatch(fetchSingle(id))
  }, [dispatch, id])

  useEffect(() => {
    refresh()
  }, [refresh])

  // The product carries only brand_id. The name is kept with the id it belongs to, so a brand
  // loaded for one product is never shown on another. A failed lookup just leaves the dash.
  const brandId = product?.id === id ? (product?.brand_id ?? null) : null
  const [brand, setBrand] = useState<{ id: string; name: string } | null>(null)
  useEffect(() => {
    if (!brandId) return
    let cancelled = false
    fetchBrand(brandId)
      .then((b) => {
        if (!cancelled) setBrand({ id: b.id, name: b.name })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [brandId])
  const brandName = brandId && brand?.id === brandId ? brand.name : null

  const hint = useKindHint()
  const loadedKind = product && product.id === id && !categoriesLoading ? productKind(product, categories) : undefined
  useRecordKind(loadedKind)

  // The page is laid out by the product's kind, which needs the categories as well as the product.
  const pageState =
    resolveDetailState(singleStatus, singleError, product?.id === id) ?? (categoriesLoading ? "loading" : null)
  if (pageState || !product || product.id !== id) {
    return (
      <DetailPageState
        state={pageState ?? "loading"}
        entity="Product"
        backTo={hint && productListPath(hint)}
        backLabel={hint === "preorder" ? "Back to pre-order products" : "Back to products"}
        error={singleError}
        onRetry={refresh}
      />
    )
  }

  const kind = productKind(product, categories)
  const isStock = kind === "stock"
  const isBundle = product.product_type === "bundle"
  const options = savedOptionsOf(product)
  const settings = product.variants.find((v) => v.is_preorder_enabled)
  const price = isStock ? (product.price === null ? null : (product.discount_price ?? product.price)) : product.price
  const bundleVariantId = isBundle ? product.variants[0]?.id : undefined

  const handleRestore = async () => {
    try {
      await restoreProduct(product.id)
      toast.success(`${product.name} restored`)
      refresh()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to restore product"))
    }
  }

  return (
    <div className="section-container space-y-6">
      <PageHeader
        title={product.name}
        back={{ to: productListPath(kind), label: isStock ? "Back to products" : "Back to pre-order products" }}
        actions={
          canManage &&
          (product.deleted_at ? (
            <Button size="action" variant="outline" onClick={handleRestore}>
              <RotateCcw className="size-5" /> Restore
            </Button>
          ) : isBundle ? (
            <Button size="action" variant="apply" asChild>
              <Link to={bundleVariantId ? `/bundles/${bundleVariantId}` : "/bundles"}>
                <Boxes className="size-5" /> Edit bundle
              </Link>
            </Button>
          ) : (
            <Button size="action" variant="apply" onClick={() => navigate(`/product_form/${product.id}`)}>
              <Edit className="size-5" /> Edit product
            </Button>
          ))
        }
      />

      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="grid gap-6 py-5 sm:grid-cols-[11rem_1fr]">
          <ProductPhoto src={product.primary_image} name={product.name} />

          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <ActiveStatusBadge deleted={product.deleted_at} active={product.is_active} />
              {isBundle && <Badge variant="secondary">Bundle</Badge>}
              {!isStock && <Badge variant="secondary">Pre-order</Badge>}
              {product.deleted_at && (
                <span className="text-xs text-muted-foreground">Deleted {formatDateTime(product.deleted_at)}</span>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {price !== null && (
                <Stat label="Price">
                  {formatCurrency(price)}
                  {isStock && product.discount_price && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground line-through">
                      {formatCurrency(product.price)}
                    </span>
                  )}
                </Stat>
              )}
              {product.cost_price !== null && <Stat label="Cost">{formatCurrency(product.cost_price)}</Stat>}
              {isStock && <Stat label="Available stock">{product.total_stock}</Stat>}
              {!isStock && settings?.preorder_start_date && (
                <Stat label="Pre-orders open">{formatDateTime(settings.preorder_start_date)}</Stat>
              )}
              {!isStock && settings?.preorder_end_date && (
                <Stat label="Pre-orders close">{formatDateTime(settings.preorder_end_date)}</Stat>
              )}
              {!isStock && settings?.release_date && <Stat label="Release date">{formatDateTime(settings.release_date)}</Stat>}
              {!isStock && settings?.preorder_stock_limit != null && (
                <Stat label="Pre-order limit">{settings.preorder_stock_limit}</Stat>
              )}
              {!isStock && (settings?.preorder_min_quantity ?? 1) > 1 && (
                <Stat label="Minimum per order">{settings?.preorder_min_quantity}</Stat>
              )}
            </dl>

            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
              <Fact label="Category">{nameById.get(product.category_id) ?? "—"}</Fact>
              <Fact label="Brand">{brandName ?? "—"}</Fact>
              <Fact label="Slug">
                <span className="font-mono text-xs font-normal">{product.slug}</span>
              </Fact>
            </dl>
          </div>
        </CardContent>

        {(product.description || product.highlights.length > 0) && (
          <CardContent
            className={cn(
              "grid gap-6 border-t border-border bg-muted/20 py-5",
              product.description && product.highlights.length > 0 && "md:grid-cols-[2fr_1fr]"
            )}
          >
            {product.description && (
              <section className="min-w-0">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <ScrollText className="size-4 text-primary" /> Description
                </h3>
                <p className="whitespace-pre-line break-words text-sm leading-relaxed text-muted-foreground">
                  {product.description}
                </p>
              </section>
            )}
            {product.highlights.length > 0 && (
              <section className="min-w-0">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <ListChecks className="size-4 text-primary" /> Highlights
                </h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {product.highlights.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </section>
            )}
          </CardContent>
        )}
      </Card>

      {!product.deleted_at && (
        <>
          <ProductImagesSection
            productId={product.id}
            options={options}
            variants={product.variants}
            canManage={canManage}
            onChanged={refresh}
          />
          {isBundle ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                This is a bundle — its components, price and SKU are managed from{" "}
                <Link className="text-primary underline" to={bundleVariantId ? `/bundles/${bundleVariantId}` : "/bundles"}>
                  the bundle editor
                </Link>
                .
              </CardContent>
            </Card>
          ) : (
            <ProductVariantsSection
              key={options.map((o) => o.id).join()}
              product={product}
              kind={kind}
              canManage={canManage}
              onChanged={refresh}
            />
          )}
        </>
      )}
    </div>
  )
}

export default ProductDetail
