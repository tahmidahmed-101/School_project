import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Boxes, Edit, Package, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { productKind, productListPath, variantCount } from "../lib/productKind"
import { useCategoryOptions } from "../lib/useCategoryOptions"
import { savedOptionsOf } from "../lib/productKind"
import { ProductVariantsSection } from "./ProductVariantsSection"
import { ProductImagesSection } from "./ProductImagesSection"

/** One line of the details table: the title on the left, its value on the right. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] text-sm sm:grid-cols-[11rem_minmax(0,1fr)]">
      {/* Padding is on the cells, not the row, so the divider after the title runs the row's full height. */}
      <dt className="border-r border-border px-4 py-3 font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words px-4 py-3 text-foreground">{children}</dd>
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
  const specs = Array.isArray(product.specs) ? product.specs : []
  const settings = product.variants.find((v) => v.is_preorder_enabled)
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
        description={product.slug}
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

      {/* Photo on the left; on the right a details table (title | value per row). On desktop the photo takes a
          third of the row and takes the table's height, so both boxes are the same height. The
          description has its own full-width card below: inside the table, a long one stretched the photo. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card className="overflow-hidden p-0">
          <div className="relative flex mx-auto aspect-square w-full max-w-64 items-center justify-center overflow-hidden bg-muted lg:aspect-auto lg:max-w-none lg:h-full lg:min-h-80">
            {product.primary_image ? (
              <img
                src={product.primary_image}
                alt={product.name}
                // Out of the flow on desktop, so the row is as tall as the details table and the photo fills it;
                // in the flow, a wide column made the square photo the taller of the two.
                className="size-full object-cover lg:absolute lg:inset-0"
              />
            ) : (
              <Package className="size-16 text-muted-foreground/40" />
            )}
          </div>
        </Card>

        <Card className="p-0">
          <dl className="divide-y divide-border">
            <Row label="Status">
              <ActiveStatusBadge deleted={product.deleted_at} active={product.is_active} />
            </Row>
            {isBundle ? (
              <Row label="Type">
                <Badge variant="secondary">Bundle</Badge>
              </Row>
            ) : (
              <Row label="Options">
                {options.length === 0
                  ? "None"
                  : options.map((o) => `${o.name}: ${o.values.map((v) => v.value).join(", ")}`).join(" · ")}
              </Row>
            )}
            <Row label="Category">{nameById.get(product.category_id) ?? "—"}</Row>
            <Row label="Brand">{brandName ?? "—"}</Row>
            {isStock ? (
              <>
                <Row label="Price">
                  <span className="font-semibold">
                    {product.price === null ? "—" : formatCurrency(product.discount_price ?? product.price)}
                  </span>
                </Row>
                {product.discount_price && <Row label="List price">{formatCurrency(product.price)}</Row>}
                <Row label="Cost">{product.cost_price === null ? "—" : formatCurrency(product.cost_price)}</Row>
                <Row label="Available stock">{product.total_stock}</Row>
              </>
            ) : (
              <>
                <Row label="Price">
                  <span className="font-semibold">{product.price === null ? "—" : formatCurrency(product.price)}</span>
                </Row>
                {settings?.preorder_price && (
                  <Row label="Pre-order price">{formatCurrency(settings.preorder_price)}</Row>
                )}
                <Row label="Cost">{product.cost_price === null ? "—" : formatCurrency(product.cost_price)}</Row>
                <Row label="Pre-orders open">{formatDateTime(settings?.preorder_start_date)}</Row>
                <Row label="Pre-orders close">{formatDateTime(settings?.preorder_end_date)}</Row>
                <Row label="Release date">{formatDateTime(settings?.release_date)}</Row>
                <Row label="Pre-order limit">{settings?.preorder_stock_limit ?? "Unlimited"}</Row>
              </>
            )}
            <Row label="Variants">{variantCount(product)}</Row>
            {product.deleted_at && <Row label="Deleted">{formatDateTime(product.deleted_at)}</Row>}
            {product.highlights.length > 0 && (
              <Row label="Highlights">
                <ul className="list-disc space-y-1 pl-5">
                  {product.highlights.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </Row>
            )}
            {specs.length > 0 && (
              <Row label="Specifications">
                <ul className="space-y-1">
                  {specs.map((spec, i) => (
                    <li key={i}>
                      <span className="text-muted-foreground">{spec.name}:</span> {spec.value}
                    </li>
                  ))}
                </ul>
              </Row>
            )}
            {product.meta_keywords && <Row label="Meta keywords">{product.meta_keywords}</Row>}
          </dl>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-line break-words text-sm">{product.description || "No description."}</p>
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
