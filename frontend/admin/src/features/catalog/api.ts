import { api, apiCall, extractApiError } from "@/lib/api/client"
import { unwrapList } from "@/lib/api/envelope"
import { fetchAllPages } from "@/lib/api/fetchAll"
import { blobErrorToJson, saveBlob } from "@/lib/download"
import { invalidateAllPages } from "@/hooks/use-all-pages"
import type {
  Brand,
  BrandPayload,
  BulkActionResult,
  Bundle,
  BundlePayload,
  Category,
  CategoryPayload,
  Product,
  ProductImage,
  ProductPayload,
  ProductVariant,
  ProductVariantPayload,
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

/** Search products by name (for pickers). */
export async function searchProducts(search: string) {
  try {
    const res = await api.get(`${C}/products/`, { params: { page: 1, page_size: 20, search } })
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
  payload: { url: string; alt_text?: string; sort_order?: number; variant_id?: string | null }
) => apiCall<ProductImage>(() => api.post(`${C}/products/${productId}/images/`, payload))
export const updateProductImage = (
  id: string,
  payload: { url?: string; alt_text?: string; sort_order?: number }
) => apiCall<ProductImage>(() => api.patch(`${C}/images/${id}/`, payload))
export const deleteProductImage = (id: string) => apiCall<unknown>(() => api.delete(`${C}/images/${id}/`))

// ---- variants ----
export async function listProductVariants(
  productId: string,
  params: { page?: number; page_size?: number; search?: string } = {}
) {
  const { page = 1, page_size = 50, ...rest } = params
  try {
    const res = await api.get(`${C}/products/${productId}/variants/`, {
      params: { page, page_size, ...rest },
    })
    return unwrapList<ProductVariant>(res.data, page, page_size)
  } catch (err) {
    throw extractApiError(err)
  }
}
export const createVariant = (productId: string, payload: ProductVariantPayload) =>
  apiCall<ProductVariant>(() => api.post(`${C}/products/${productId}/variants/`, payload))
export const updateVariant = (id: string, payload: ProductVariantPayload) =>
  apiCall<ProductVariant>(() => api.patch(`${C}/variants/${id}/`, payload))
export const deleteVariant = (id: string) => apiCall<unknown>(() => api.delete(`${C}/variants/${id}/`))
export const generateVariants = (productId: string, payload: VariantGeneratePayload) =>
  apiCall<VariantGenerateResult>(() => api.post(`${C}/products/${productId}/variants/generate/`, payload))

/** Search variants across the catalog (for pickers). */
export async function searchVariants(search: string, extra: Record<string, unknown> = {}) {
  try {
    const res = await api.get(`${C}/variants/`, { params: { page: 1, page_size: 20, search, ...extra } })
    return unwrapList<ProductVariant>(res.data, 1, 20).items
  } catch (err) {
    throw extractApiError(err)
  }
}

/** GET /admin/catalog/variants/export/?file_format=csv|xlsx → triggers a browser download. */
export async function downloadVariantsExport(
  fileFormat: "csv" | "xlsx",
  filters: { search?: string; product_id?: string; category_id?: string } = {}
) {
  try {
    const res = await api.get(`${C}/variants/export/`, {
      params: { file_format: fileFormat, ...filters },
      responseType: "blob",
    })
    saveBlob(res.data as Blob, `variants.${fileFormat}`)
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
/** Every category (all pages; page_size is capped at 100 server-side). */
export const CATEGORIES_ENDPOINT = `${C}/categories/`
export const categoryListParams = (includeDeleted = false) => ({
  ordering: "name",
  ...(includeDeleted ? { include_deleted: true } : {}),
})
const categoriesChanged = <R>(res: R) => {
  invalidateAllPages(CATEGORIES_ENDPOINT)
  return res
}
export const fetchAllCategories = (params: { include_deleted?: boolean } = {}) =>
  fetchAllPages<Category>(CATEGORIES_ENDPOINT, categoryListParams(params.include_deleted))
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
/** Every active brand (for pickers). */
export const fetchAllBrands = () => fetchAllPages<Brand>(`${C}/brands/`, { is_active: true })
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
