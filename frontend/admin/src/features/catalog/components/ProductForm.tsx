import { useEffect } from "react"
import { Link, useParams } from "react-router-dom"

import { DetailPageState } from "@/components/common/DetailPageState"
import { NoPermission } from "@/components/common/NoPermission"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { resolveDetailState } from "@/lib/detailState"

import { fetchSingle } from "../slices/productSlice"
import type { Product } from "../types"
import { useCategoryOptions } from "../lib/useCategoryOptions"
import { StockProductForm } from "./StockProductForm"

/** Loads the product and hands over to the product form. */
const ProductForm = () => {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id && id !== "new")
  const dispatch = useAppDispatch()
  const canManage = useCan("catalog.manage")
  const { singleData, singleStatus, singleError } = useAppSelector((s) => s.products)
  const loaded = singleData as Product | null
  const product = isEditing && loaded?.id === id ? loaded : null
  const { options: categoryOptions, isLoading: categoriesLoading } = useCategoryOptions()

  useDocumentTitle(isEditing ? (product?.name ? `Edit ${product.name}` : "Edit Product") : "Add Product")

  useEffect(() => {
    if (isEditing && id) dispatch(fetchSingle(id))
  }, [dispatch, id, isEditing])

  if (!canManage) {
    return (
      <NoPermission
        message="You don't have permission to edit products."
        backTo="/products"
        backLabel="Back to products"
      />
    )
  }

  const pageState = isEditing
    ? (resolveDetailState(singleStatus, singleError, Boolean(product)) ?? (categoriesLoading ? "loading" : null))
    : null
  if (pageState) {
    return (
      <DetailPageState
        state={pageState}
        entity="Product"
        backTo="/products"
        backLabel="Back to products"
        error={singleError}
        onRetry={() => id && dispatch(fetchSingle(id))}
      />
    )
  }

  if (product?.product_type === "bundle") {
    const bundleId = product.variants[0]?.id
    return (
      <div className="section-container py-16 text-center text-sm text-muted-foreground">
        Bundles are edited from the Bundles page.{" "}
        <Link className="text-primary underline" to={bundleId ? `/bundles/${bundleId}` : "/bundles"}>
          Open bundle editor
        </Link>
      </div>
    )
  }

  return <StockProductForm key={product?.id ?? "new"} product={product} categoryOptions={categoryOptions} />
}

export default ProductForm
