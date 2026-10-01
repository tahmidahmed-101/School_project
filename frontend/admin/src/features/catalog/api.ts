import { api, extractApiError } from "@/lib/api/client"
import { unwrapItem, unwrapList } from "@/lib/api/envelope"
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
async function call<T>(fn: () => Promise<{ data: unknown }>): Promise<T> {
  try {
    const res = await fn()
    return unwrapItem<T>(res.data)
  } catch (err) {
    throw extractApiError(err)
  }
}

const C = "/admin/catalog"

// ---- media ----
/** POST /admin/media/uploads/ (multipart `file`) → absolute URL of the stored image. */
export async function uploadMedia(file: File): Promise<string> {
  const form = new FormData()
  form.append("file", file)
  const data = await call<{ url: string; path: string }>(() => api.post("/admin/media/uploads/", form))
  return data.url
}

// ---- products ----
export const createProduct = (payload: ProductPayload) =>
  call<Product>(() => api.post(`${C}/products/`, payload))
export const updateProduct = (id: string, payload: ProductPayload) =>
  call<Product>(() => api.patch(`${C}/products/${id}/`, payload))
export const restoreProduct = (id: string) =>
  call<Product>(() => api.post(`${C}/products/${id}/restore/`))
export const bulkProductStatus = (ids: string[], is_active: boolean) =>
  call<BulkActionResult>(() => api.post(`${C}/products/bulk-status/`, { ids, is_active }))

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
) => call<ProductImage>(() => api.post(`${C}/products/${productId}/images/`, payload))
export const updateProductImage = (
  id: string,
  payload: { url?: string; alt_text?: string; sort_order?: number }
) => call<ProductImage>(() => api.patch(`${C}/images/${id}/`, payload))
export const deleteProductImage = (id: string) => call<unknown>(() => api.delete(`${C}/images/${id}/`))

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
  call<ProductVariant>(() => api.post(`${C}/products/${productId}/variants/`, payload))
export const updateVariant = (id: string, payload: ProductVariantPayload) =>
  call<ProductVariant>(() => api.patch(`${C}/variants/${id}/`, payload))
export const deleteVariant = (id: string) => call<unknown>(() => api.delete(`${C}/variants/${id}/`))
export const generateVariants = (productId: string, payload: VariantGeneratePayload) =>
  call<VariantGenerateResult>(() => api.post(`${C}/products/${productId}/variants/generate/`, payload))

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
  return call<VariantImportResult>(() =>
    api.post(`${C}/variants/import/`, form, { params: { file_format: fileFormat } })
  )
}

// ---- categories ----
/** Every category (all pages; page_size is capped at 100 server-side). */
export async function fetchAllCategories(params: { include_deleted?: boolean } = {}): Promise<Category[]> {
  const out: Category[] = []
  try {
    for (let page = 1; page < 50; page++) {
      const res = await api.get(`${C}/categories/`, {
        params: { page, page_size: 100, ordering: "name", ...(params.include_deleted ? { include_deleted: true } : {}) },
      })
      const { items, meta } = unwrapList<Category>(res.data, page, 100)
      out.push(...items)
      if (out.length >= meta.count || items.length === 0) break
    }
  } catch (err) {
    throw extractApiError(err)
  }
  return out
}
export const createCategory = (payload: CategoryPayload) =>
  call<Category>(() => api.post(`${C}/categories/`, payload))
export const updateCategory = (id: string, payload: CategoryPayload) =>
  call<Category>(() => api.patch(`${C}/categories/${id}/`, payload))
export const uploadCategoryImage = (id: string, file: File) => {
  const form = new FormData()
  form.append("image", file)
  return call<Category>(() => api.patch(`${C}/categories/${id}/`, form))
}
export const deleteCategory = (id: string) => call<unknown>(() => api.delete(`${C}/categories/${id}/`))
export const restoreCategory = (id: string) =>
  call<Category>(() => api.post(`${C}/categories/${id}/restore/`))

// ---- brands ----
export const createBrand = (payload: BrandPayload) => call<Brand>(() => api.post(`${C}/brands/`, payload))
export const updateBrand = (id: string, payload: BrandPayload) =>
  call<Brand>(() => api.patch(`${C}/brands/${id}/`, payload))
export const uploadBrandImage = (id: string, file: File) => {
  const form = new FormData()
  form.append("image", file)
  return call<Brand>(() => api.patch(`${C}/brands/${id}/`, form))
}
export const restoreBrand = (id: string) => call<Brand>(() => api.post(`${C}/brands/${id}/restore/`))
export const bulkBrandStatus = (ids: string[], is_active: boolean) =>
  call<BulkActionResult>(() => api.post(`${C}/brands/bulk-status/`, { ids, is_active }))

// ---- bundles ----
export const createBundle = (payload: BundlePayload) => call<Bundle>(() => api.post(`${C}/bundles/`, payload))
export const updateBundle = (id: string, payload: BundlePayload) =>
  call<Bundle>(() => api.patch(`${C}/bundles/${id}/`, payload))
export const restoreBundle = (id: string) => call<Bundle>(() => api.post(`${C}/bundles/${id}/restore/`))

// ---- helpers ----
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A failed `responseType: "blob"` request carries its JSON error body as a Blob; parse it back. */
export async function blobErrorToJson(err: unknown): Promise<unknown> {
  const e = err as { response?: { data?: unknown } }
  if (e?.response?.data instanceof Blob) {
    try {
      e.response.data = JSON.parse(await e.response.data.text())
    } catch {
      // leave as-is
    }
  }
  return err
}
