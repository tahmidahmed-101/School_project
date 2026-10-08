import { useEffect, useMemo } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"

import { DetailPageState } from "@/components/common/DetailPageState"
import { NoPermission } from "@/components/common/NoPermission"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { useKindHint, useRecordKind, type Kind } from "@/hooks/use-kind"
import { resolveDetailState } from "@/lib/detailState"

import { fetchSingle } from "../slices/productSlice"
import type { Product } from "../types"
import { productKind, productListPath } from "../lib/productKind"
import { useCategoryOptions } from "../lib/useCategoryOptions"
import { PreorderProductForm } from "./PreorderProductForm"
import { StockProductForm } from "./StockProductForm"

/** Loads the product, works out its kind and hands over to that kind's form. */
const ProductForm = () => {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id && id !== "new")
  const dispatch = useAppDispatch()
  const canManage = useCan("catalog.manage")
  const { singleData, singleStatus, singleError } = useAppSelector((s) => s.products)
  const loaded = singleData as Product | null
  const product = isEditing && loaded?.id === id ? loaded : null
  const { categories, options, isLoading: categoriesLoading } = useCategoryOptions()

  // A saved product keeps the kind of its category; a new one takes the kind of the list it was opened from.
  const listKind: Kind = useSearchParams()[0].get("kind") === "preorder" ? "preorder" : "stock"
  const hint = useKindHint()
  const kind = product ? productKind(product, categories) : listKind
  useRecordKind(isEditing ? (product && !categoriesLoading ? kind : undefined) : listKind)
  const categoryOptions = useMemo(() => options.filter((o) => o.category.category_type === kind), [options, kind])

  useDocumentTitle(isEditing ? (product?.name ? `Edit ${product.name}` : "Edit Product") : "Add Product")

  useEffect(() => {
    if (isEditing && id) dispatch(fetchSingle(id))
  }, [dispatch, id, isEditing])

  if (!canManage) {
    return (
      <NoPermission
        message="You don't have permission to edit products."
        backTo={productListPath(hint ?? "stock")}
        backLabel={hint === "preorder" ? "Back to pre-order products" : "Back to products"}
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
        backTo={hint && productListPath(hint)}
        backLabel={hint === "preorder" ? "Back to pre-order products" : "Back to products"}
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

  const Form = kind === "preorder" ? PreorderProductForm : StockProductForm
  return <Form key={product?.id ?? "new"} product={product} categoryOptions={categoryOptions} />
}

export default ProductForm
