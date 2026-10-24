import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import {
  Banknote,
  Boxes,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  Coins,
  Edit,
  Hash,
  ListChecks,
  Package,
  RotateCcw,
  ScrollText,
  type LucideIcon,
} from "lucide-react"

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
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format"
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
    // A full-width square on phones; from `md` it fills its column at the height of the details
    // beside it. The image is laid over the box, so a tall photo can never make the row taller.
    <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-muted md:aspect-auto md:h-full">
      {showImage ? (
        <img
          src={src}
          alt={name}
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <Package className="size-12 text-muted-foreground/40" aria-label="No photo" />
      )}
    </div>
  )
}

/** One labelled figure (price, cost, stock, pre-order window...); the price tile is set off in the brand colour. */
function Stat({
  label,
  icon: Icon,
  accent = false,
  children,
}: {
  label: string
  icon: LucideIcon
  accent?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-xl border p-3.5",
        accent ? "border-primary/25 bg-primary/5" : "border-border bg-card"
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          accent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="truncate text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className={cn("truncate text-lg font-semibold tabular-nums", accent && "text-primary")}>{children}</dd>
      </div>
    </div>
  )
}

/** A date that fits a tile; the time is there on hover. */
function TileDate({ value }: { value: string }) {
  return <span title={formatDateTime(value)}>{formatDate(value)}</span>
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
  const hasAbout = Boolean(product.description) || product.highlights.length > 0

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
        description={`Code #${product.product_code}`}
        badges={!isStock && <Badge variant="secondary">Pre-order</Badge>}
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

      {/* Photo beside the details, which take the full remaining width; description and
          highlights in their own band underneath. On phones everything stacks. */}
      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="grid gap-6 py-5 md:grid-cols-[13rem_minmax(0,1fr)]">
          <ProductPhoto src={product.primary_image} name={product.name} />

          <div className="min-w-0 space-y-5">
            {/* Three tiles to a row (a stock product has exactly three; a pre-order one wraps). */}
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {price !== null && (
                <Stat label="Price" icon={Banknote} accent>
                  {formatCurrency(price)}
                  {isStock && product.discount_price && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground line-through">
                      {formatCurrency(product.price)}
                    </span>
                  )}
                </Stat>
              )}
              {product.cost_price !== null && (
                <Stat label="Cost" icon={Coins}>
                  {formatCurrency(product.cost_price)}
                </Stat>
              )}
              {isStock && (
                <Stat label="Available stock" icon={Boxes}>
                  {product.total_stock}
                </Stat>
              )}
              {/* Pre-order: price, cost and limit make the first row (the limit tile always
                  shows, so the dates below never move up into it), then the dates. */}
              {!isStock && (
                <Stat label="Pre-order limit" icon={Hash}>
                  {settings?.preorder_stock_limit ?? <span className="font-normal text-muted-foreground">No limit</span>}
                </Stat>
              )}
              {!isStock && settings?.preorder_start_date && (
                <Stat label="Pre-orders open" icon={CalendarClock}>
                  <TileDate value={settings.preorder_start_date} />
                </Stat>
              )}
              {!isStock && settings?.preorder_end_date && (
                <Stat label="Pre-orders close" icon={CalendarX}>
                  <TileDate value={settings.preorder_end_date} />
                </Stat>
              )}
              {!isStock && settings?.release_date && (
                <Stat label="Release date" icon={CalendarCheck}>
                  <TileDate value={settings.release_date} />
                </Stat>
              )}
              {!isStock && (settings?.preorder_min_quantity ?? 1) > 1 && (
                <Stat label="Minimum per order" icon={Package}>
                  {settings?.preorder_min_quantity}
                </Stat>
              )}
            </dl>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-dashed border-border px-4 py-3 lg:grid-cols-4">
              <Fact label="Status">
                <span className="flex flex-wrap items-center gap-1.5">
                  <ActiveStatusBadge deleted={product.deleted_at} active={product.is_active} />
                  {isBundle && <Badge variant="secondary">Bundle</Badge>}
                </span>
                {product.deleted_at && (
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    Deleted {formatDateTime(product.deleted_at)}
                  </span>
                )}
              </Fact>
              <Fact label="Category">{nameById.get(product.category_id) ?? "—"}</Fact>
              <Fact label="Brand">{brandName ?? "—"}</Fact>
              <Fact label="Slug">
                <span className="font-mono text-xs font-normal">{product.slug}</span>
              </Fact>
            </dl>
          </div>
        </CardContent>

        {hasAbout && (
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
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground marker:text-primary">
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
