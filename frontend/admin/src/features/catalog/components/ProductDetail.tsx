import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Banknote, Boxes, CalendarClock, Coins, Edit, FolderTree, Hash, Link2, Package, PackageCheck, RotateCcw, Tag } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { IconLine } from "@/components/common/IconLine"
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

import { fetchSingle } from "../slices/productSlice"
import { fetchBrand, restoreProduct } from "../api"
import type { Product } from "../types"
import { productKind, productListPath } from "../lib/productKind"
import { useCategoryOptions } from "../lib/useCategoryOptions"
import { savedOptionsOf } from "../lib/productKind"
import { ProductVariantsSection } from "./ProductVariantsSection"
import { ProductImagesSection } from "./ProductImagesSection"

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

      <Card>
        <CardContent className="flex flex-col gap-4 py-4 sm:flex-row">
          <div className="flex size-32 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
            {product.primary_image ? (
              <img src={product.primary_image} alt={product.name} className="size-full object-cover" />
            ) : (
              <Package className="size-10 text-muted-foreground/40" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <ActiveStatusBadge deleted={product.deleted_at} active={product.is_active} />
              {isBundle && <Badge variant="secondary">Bundle</Badge>}
              {product.deleted_at && <span className="text-xs text-muted-foreground">{formatDateTime(product.deleted_at)}</span>}
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <IconLine icon={FolderTree} label="Category">
                {nameById.get(product.category_id) ?? "—"}
              </IconLine>
              {brandName && (
                <IconLine icon={Tag} label="Brand">
                  {brandName}
                </IconLine>
              )}
              <IconLine icon={Link2} label="Slug">
                <span className="font-mono text-xs">{product.slug}</span>
              </IconLine>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {price !== null && (
                <IconLine icon={Banknote} label="Price">
                  <span className="font-semibold">{formatCurrency(price)}</span>
                  {isStock && product.discount_price && (
                    <span className="ml-2 text-muted-foreground line-through">{formatCurrency(product.price)}</span>
                  )}
                </IconLine>
              )}
              {product.cost_price !== null && (
                <IconLine icon={Coins} label="Cost">
                  {formatCurrency(product.cost_price)}
                </IconLine>
              )}
              {isStock && (
                <IconLine icon={Boxes} label="Available stock">
                  {product.total_stock}
                </IconLine>
              )}
              {!isStock && settings?.preorder_start_date && (
                <IconLine icon={CalendarClock} label="Pre-orders open">
                  {formatDateTime(settings.preorder_start_date)}
                  {settings.preorder_end_date && ` → ${formatDateTime(settings.preorder_end_date)}`}
                </IconLine>
              )}
              {!isStock && settings?.release_date && (
                <IconLine icon={PackageCheck} label="Release date">
                  {formatDateTime(settings.release_date)}
                </IconLine>
              )}
              {!isStock && settings?.preorder_stock_limit != null && (
                <IconLine icon={Hash} label="Pre-order limit">
                  {settings.preorder_stock_limit}
                </IconLine>
              )}
              {!isStock && (settings?.preorder_min_quantity ?? 1) > 1 && (
                <IconLine icon={Package} label="Minimum per order">
                  {settings?.preorder_min_quantity}
                </IconLine>
              )}
            </div>

            {product.description && (
              <p className="whitespace-pre-line break-words border-t border-border pt-3 text-sm">{product.description}</p>
            )}

            {product.highlights.length > 0 && (
              <ul className="list-disc space-y-1 border-t border-border pt-3 pl-5 text-sm">
                {product.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
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
