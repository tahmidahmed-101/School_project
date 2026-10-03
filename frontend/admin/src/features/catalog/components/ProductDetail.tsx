import { useCallback, useEffect } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Boxes, Edit, Package, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DetailPageState } from "@/components/common/DetailPageState"
import { PageHeader } from "@/components/common/PageHeader"
import { DetailRow } from "@/components/common/DetailRow"
import { ActiveStatusBadge } from "@/components/common/cells"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { getApiErrorMessage } from "@/lib/api/client"
import { resolveDetailState } from "@/lib/detailState"
import { formatCurrency, formatDateTime } from "@/lib/format"

import { fetchSingle } from "../slices/productSlice"
import { restoreProduct } from "../api"
import type { Product } from "../types"
import { useCategoryOptions } from "../lib/useCategoryOptions"
import { ProductVariantsSection } from "./ProductVariantsSection"
import { ProductImagesSection } from "./ProductImagesSection"

const ProductDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = useCan("catalog.manage")
  const canViewInventory = useCan("inventory.view", "inventory.manage")
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
      <PageHeader
        title={product.name}
        description={product.slug}
        back={{ to: "/products", label: "Back to products" }}
        badges={
          <span className="flex flex-wrap items-center gap-2">
            <ActiveStatusBadge deleted={product.deleted_at} active={product.is_active} />
            <Badge variant="secondary" className="capitalize">
              {product.product_type}
            </Badge>
          </span>
        }
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden pt-0 lg:col-span-1">
          <div className="flex aspect-square w-full items-center justify-center overflow-hidden bg-muted">
            {product.primary_image ? (
              <img src={product.primary_image} alt={product.name} className="size-full object-cover" />
            ) : (
              <Package className="size-16 text-muted-foreground/40" />
            )}
          </div>
          <CardContent className="pt-2">
            <DetailRow label="Category">{nameById.get(product.category_id) ?? "—"}</DetailRow>
            <DetailRow label="Price">
              {product.price === null ? "—" : formatCurrency(product.discount_price ?? product.price)}
            </DetailRow>
            {product.discount_price && <DetailRow label="List price">{formatCurrency(product.price)}</DetailRow>}
            <DetailRow label="Cost">{product.cost_price === null ? "—" : formatCurrency(product.cost_price)}</DetailRow>
            <DetailRow label="Available stock">{product.total_stock}</DetailRow>
            <DetailRow label="Variants">{product.variants.length}</DetailRow>
            {product.deleted_at && <DetailRow label="Deleted">{formatDateTime(product.deleted_at)}</DetailRow>}
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
