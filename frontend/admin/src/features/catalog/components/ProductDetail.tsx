import { useCallback, useEffect } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, Boxes, Edit, Package, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DetailPageState } from "@/components/common/DetailPageState"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { resolveDetailState } from "@/lib/detailState"
import { formatCurrency, formatDateTime } from "@/lib/format"

import { fetchSingle } from "../slices/productSlice"
import { restoreProduct } from "../api"
import type { Product } from "../types"
import { usePermission } from "../lib/usePermission"
import { useCategoryOptions } from "../lib/useCategoryOptions"
import { ProductVariantsSection } from "./ProductVariantsSection"
import { ProductImagesSection } from "./ProductImagesSection"

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}

const ProductDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = usePermission("catalog.manage")
  const canViewInventory = usePermission("inventory.view", "inventory.manage")
  const { singleData, singleStatus, singleError } = useAppSelector((s) => s.products)
  const product = singleData as Product | null
  const { nameById } = useCategoryOptions()

  useDocumentTitle(product?.name ? `${product.name} — Product` : "Product Details")

  const refresh = useCallback(() => {
    if (id) dispatch(fetchSingle(id))
  }, [dispatch, id])

  useEffect(() => {
    refresh()
  }, [refresh])

  const pageState = resolveDetailState(singleStatus, singleError, product?.id === id)
  if (pageState || !product || product.id !== id) {
    return (
      <DetailPageState
        state={pageState ?? "loading"}
        entity="Product"
        backTo="/products"
        backLabel="Back to Products"
        error={singleError}
        onRetry={refresh}
      />
    )
  }

  const isBundle = product.product_type === "bundle"
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
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="back" size="icon" aria-label="Back to products" onClick={() => navigate("/products")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{product.name}</h1>
              {product.deleted_at ? (
                <StatusBadge status="deleted" tone="destructive" />
              ) : (
                <StatusBadge status={product.is_active ? "active" : "inactive"} />
              )}
              <Badge variant="secondary" className="capitalize">
                {product.product_type}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">{product.slug}</p>
          </div>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {product.deleted_at ? (
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
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-1">
          <div className="flex aspect-square w-full items-center justify-center overflow-hidden bg-muted">
            {product.primary_image ? (
              <img src={product.primary_image} alt={product.name} className="size-full object-cover" />
            ) : (
              <Package className="size-16 text-muted-foreground/40" />
            )}
          </div>
          <CardContent className="divide-y divide-border pt-2">
            <InfoRow label="Category">{nameById.get(product.category_id) ?? "—"}</InfoRow>
            <InfoRow label="Price">
              {product.price === null ? "—" : formatCurrency(product.discount_price ?? product.price)}
            </InfoRow>
            {product.discount_price && <InfoRow label="List price">{formatCurrency(product.price)}</InfoRow>}
            <InfoRow label="Cost">{product.cost_price === null ? "—" : formatCurrency(product.cost_price)}</InfoRow>
            <InfoRow label="Available stock">{product.total_stock}</InfoRow>
            <InfoRow label="Variants">{product.variants.length}</InfoRow>
            {product.deleted_at && <InfoRow label="Deleted">{formatDateTime(product.deleted_at)}</InfoRow>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <p className="whitespace-pre-line text-muted-foreground">{product.description || "No description."}</p>
            {product.highlights.length > 0 && (
              <div>
                <h3 className="mb-2 font-medium">Highlights</h3>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  {product.highlights.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>
            )}
            {product.meta_keywords && (
              <div>
                <h3 className="mb-2 font-medium">Meta keywords</h3>
                <p className="text-muted-foreground">{product.meta_keywords}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {!product.deleted_at && (
        <>
          <ProductImagesSection
            productId={product.id}
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
              productId={product.id}
              productType={product.product_type}
              canManage={canManage}
              canViewInventory={canViewInventory}
              onChanged={refresh}
            />
          )}
        </>
      )}
    </div>
  )
}

export default ProductDetail
