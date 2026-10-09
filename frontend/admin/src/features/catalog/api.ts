import { api, apiCall, extractApiError } from "@/lib/api/client"
import { unwrapList } from "@/lib/api/envelope"
import { fetchAllPages } from "@/lib/api/fetchAll"
import { blobErrorToJson, saveBlob } from "@/lib/download"
import { invalidateAllPages } from "@/hooks/use-all-pages"
import type { Kind } from "@/hooks/use-kind"
import type {
  Brand,
  BrandPayload,
  BulkActionResult,
  Bundle,
  BundlePayload,
  Category,
  CategoryPayload,
  Product,
  Combination,
  OptionSuggestions,
  ProductImage,
  ProductOptionsPayload,
  ProductOptionsResult,
  ProductPayload,
  ProductVariant,
  ProductVariantPayload,
  VariantBulkUpdatePayload,
  VariantGeneratePayload,
  VariantGenerateResult,
  VariantImportResult,
} from "./types"

/**
 * Direct calls for catalog write/action endpoints. List/detail reads go through the slices;
 * everything here throws a normalised ApiError (see extractApiError) on failure, so callers
 * can use getApiErrorMessage / getApiFieldErrors on the caught value.
 */

const C = "/admin/catalog"

// ---- media ----
/** POST /admin/media/uploads/ (multipart `file`) → absolute URL of the stored image. */
export async function uploadMedia(file: File): Promise<string> {
  const form = new FormData()
  form.append("file", file)
  const data = await apiCall<{ url: string; path: string }>(() => api.post("/admin/media/uploads/", form))
  return data.url
}

// ---- products ----
export const createProduct = (payload: ProductPayload) =>
  apiCall<Product>(() => api.post(`${C}/products/`, payload))
export const updateProduct = (id: string, payload: ProductPayload) =>
  apiCall<Product>(() => api.patch(`${C}/products/${id}/`, payload))
export const restoreProduct = (id: string) =>
  apiCall<Product>(() => api.post(`${C}/products/${id}/restore/`))
export const bulkProductStatus = (ids: string[], is_active: boolean) =>
  apiCall<BulkActionResult>(() => api.post(`${C}/products/bulk-status/`, { ids, is_active }))

/** Search products of one kind by name (for pickers). */
export async function searchProducts(search: string, kind: Kind) {
  try {
    const res = await api.get(`${C}/products/`, {
      params: { page: 1, page_size: 20, search, category_type: kind },
    })
    return unwrapList<Product>(res.data, 1, 20).items
  } catch (err) {
    throw extractApiError(err)
  }
}

// ---- product images ----
export async function listProductImages(productId: string): Promise<ProductImage[]> {
  try {
    const res = await api.get(`${C}/products/${productId}/images/`, { params: { page_size: 100 } })
    return unwrapList<ProductImage>(res.data, 1, 100).items
  } catch (err) {
    throw extractApiError(err)
  }
}
export const createProductImage = (
  productId: string,
  payload: { url: string; alt_text?: string; sort_order?: number; option_value_id?: string | null }
) => apiCall<ProductImage>(() => api.post(`${C}/products/${productId}/images/`, payload))
export const updateProductImage = (
  id: string,
  payload: { url?: string; alt_text?: string; sort_order?: number; option_value_id?: string | null }
) => apiCall<ProductImage>(() => api.patch(`${C}/images/${id}/`, payload))
export const deleteProductImage = (id: string) => apiCall<unknown>(() => api.delete(`${C}/images/${id}/`))

// ---- options ----
export const saveProductOptions = (productId: string, payload: ProductOptionsPayload) =>
  apiCall<ProductOptionsResult>(() => api.put(`${C}/products/${productId}/options/`, payload))
export const listCombinations = (productId: string) =>
  apiCall<{ combinations: Combination[] }>(() => api.get(`${C}/products/${productId}/combinations/`))
/** Option names used in the shop and, with `name`, the values used under it; most used first. */
export const fetchOptionSuggestions = (name?: string) =>
  apiCall<OptionSuggestions>(() => api.get(`${C}/option-suggestions/`, { params: name ? { name } : {} }))

// ---- variants ----
/** Every variant of one product (all pages). */
export const fetchAllProductVariants = (productId: string) =>
  fetchAllPages<ProductVariant>(`${C}/products/${productId}/variants/`)
export const createVariant = (productId: string, payload: ProductVariantPayload) =>
  apiCall<ProductVariant>(() => api.post(`${C}/products/${productId}/variants/`, payload))
export const updateVariant = (id: string, payload: ProductVariantPayload) =>
  apiCall<ProductVariant>(() => api.patch(`${C}/variants/${id}/`, payload))
export const deleteVariant = (id: string) => apiCall<unknown>(() => api.delete(`${C}/variants/${id}/`))
export const generateVariants = (productId: string, payload: VariantGeneratePayload) =>
  apiCall<VariantGenerateResult>(() => api.post(`${C}/products/${productId}/variants/generate/`, payload))
export const bulkUpdateVariants = (productId: string, payload: VariantBulkUpdatePayload) =>
  apiCall<unknown>(() => api.post(`${C}/products/${productId}/variants/bulk-update/`, payload))

/** GET /admin/catalog/variants/export/?file_format=csv|xlsx → triggers a browser download. */
export async function downloadVariantsExport(
  fileFormat: "csv" | "xlsx",
  filters: { search?: string; product_id?: string; category_id?: string; category_type?: Kind } = {}
) {
  try {
    const res = await api.get(`${C}/variants/export/`, {
      params: { file_format: fileFormat, ...filters },
      responseType: "blob",
    })
    saveBlob(res.data as Blob, `${filters.category_type === "preorder" ? "pre-order" : "stock"}-variants.${fileFormat}`)
  } catch (err) {
    throw extractApiError(await blobErrorToJson(err))
  }
}

export async function importVariants(file: File, fileFormat: "csv" | "xlsx") {
  const form = new FormData()
  form.append("file", file)
  return apiCall<VariantImportResult>(() =>
    api.post(`${C}/variants/import/`, form, { params: { file_format: fileFormat } })
  )
}

// ---- categories ----
export const CATEGORIES_ENDPOINT = `${C}/categories/`
export const categoryListParams = (kind?: Kind) => ({
  ordering: "name",
  ...(kind ? { category_type: kind } : {}),
})
const categoriesChanged = <R>(res: R) => {
  invalidateAllPages(CATEGORIES_ENDPOINT)
  return res
}
/** Every category of one kind, or of both when no kind is given (all pages; page_size is capped at 100 server-side). */
export const fetchAllCategories = (kind?: Kind) =>
  fetchAllPages<Category>(CATEGORIES_ENDPOINT, categoryListParams(kind))
export const createCategory = (payload: CategoryPayload) =>
  apiCall<Category>(() => api.post(`${C}/categories/`, payload).then(categoriesChanged))
export const updateCategory = (id: string, payload: CategoryPayload) =>
  apiCall<Category>(() => api.patch(`${C}/categories/${id}/`, payload).then(categoriesChanged))
export const uploadCategoryImage = (id: string, file: File) => {
  const form = new FormData()
  form.append("image", file)
  return apiCall<Category>(() => api.patch(`${C}/categories/${id}/`, form).then(categoriesChanged))
}
export const deleteCategory = (id: string) =>
  apiCall<unknown>(() => api.delete(`${C}/categories/${id}/`).then(categoriesChanged))
export const restoreCategory = (id: string) =>
  apiCall<Category>(() => api.post(`${C}/categories/${id}/restore/`).then(categoriesChanged))

// ---- brands ----
/** Every active brand of one kind (for pickers). */
export const fetchAllBrands = (kind: Kind) => fetchAllPages<Brand>(`${C}/brands/`, { is_active: true, kind })
/** One brand by id, active or not. */
export const fetchBrand = (id: string) => apiCall<Brand>(() => api.get(`${C}/brands/${id}/`))
export const createBrand = (payload: BrandPayload) => apiCall<Brand>(() => api.post(`${C}/brands/`, payload))
export const updateBrand = (id: string, payload: BrandPayload) =>
  apiCall<Brand>(() => api.patch(`${C}/brands/${id}/`, payload))
export const uploadBrandImage = (id: string, file: File) => {
  const form = new FormData()
  form.append("image", file)
  return apiCall<Brand>(() => api.patch(`${C}/brands/${id}/`, form))
}
export const restoreBrand = (id: string) => apiCall<Brand>(() => api.post(`${C}/brands/${id}/restore/`))
export const bulkBrandStatus = (ids: string[], is_active: boolean) =>
  apiCall<BulkActionResult>(() => api.post(`${C}/brands/bulk-status/`, { ids, is_active }))

// ---- bundles ----
export const createBundle = (payload: BundlePayload) => apiCall<Bundle>(() => api.post(`${C}/bundles/`, payload))
export const updateBundle = (id: string, payload: BundlePayload) =>
  apiCall<Bundle>(() => api.patch(`${C}/bundles/${id}/`, payload))
export const restoreBundle = (id: string) => apiCall<Bundle>(() => api.post(`${C}/bundles/${id}/restore/`))
