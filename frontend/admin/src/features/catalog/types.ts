// Mirrors kull-mart api/v1/admin/catalog/serializers.py + bundle_serializers.py.
// Money/decimal fields are strings (DRF DecimalField); ids are UUID strings.

export type ProductType = "simple" | "variant" | "bundle"
export type CategoryType = "stock" | "preorder"

export const productTypeOptions: { label: string; value: ProductType }[] = [
  { label: "Simple", value: "simple" },
  { label: "Variant", value: "variant" },
  { label: "Bundle", value: "bundle" },
]

/** ProductImageSerializer */
export interface ProductImage {
  id: string
  product_id: string | null
  variant_id: string | null
  url: string
  alt_text: string
  sort_order: number
}

/** ProductVariantSerializer */
export interface ProductVariant {
  id: string
  product_id: string
  product_name: string
  sku: string
  barcode: string
  price: string
  cost_price: string
  discount_price: string | null
  weight: string | null
  is_active: boolean
  color: string
  size: string
  wholesale_price: string | null
  show_wholesale_price: boolean
  is_preorder_enabled: boolean
  preorder_price: string | null
  preorder_start_date: string | null
  preorder_end_date: string | null
  release_date: string | null
  preorder_stock_limit: number | null
  is_preorder_active: boolean
  can_preorder: boolean
  effective_price: string
  is_preorder_price_applied: boolean
  stock: number
  is_low_stock: boolean
  primary_image: string | null
  images: ProductImage[]
}

/** ProductVariantCreateSerializer / ProductVariantUpdateSerializer (all optional on update). */
export interface ProductVariantPayload {
  sku?: string
  barcode?: string
  price?: string | null
  cost_price?: string | null
  discount_price?: string | null
  weight?: string | null
  color?: string
  size?: string
  is_active?: boolean
  wholesale_price?: string | null
  show_wholesale_price?: boolean
  is_preorder_enabled?: boolean
  preorder_price?: string | null
  preorder_start_date?: string | null
  preorder_end_date?: string | null
  release_date?: string | null
  preorder_stock_limit?: number | null
}

/** VariantGenerateSerializer */
export interface VariantGeneratePayload {
  colors: string[]
  sizes: string[]
  price: string
  cost_price?: string
}

export interface VariantGenerateResult {
  created: ProductVariant[]
  skipped_existing: ProductVariant[]
  stale: ProductVariant[]
}

export interface VariantImportResult {
  created: number
  updated: number
  errors: { row: number; sku: string; message: string }[]
}

/** CategorySerializer */
export interface Category {
  id: string
  name: string
  slug: string
  parent_id: string | null
  description: string
  category_type: CategoryType
  is_active: boolean
  image: string | null
  deleted_at: string | null
}

/** CategoryCreateSerializer / CategoryUpdateSerializer (image is multipart-only on PATCH). */
export interface CategoryPayload {
  name?: string
  parent_id?: string | null
  description?: string
  category_type?: CategoryType
  is_active?: boolean
}

/** ProductSerializer */
export interface Product {
  id: string
  category_id: string
  brand_id: string | null
  /** Shown in the storefront's featured sections. */
  featured: boolean
  name: string
  slug: string
  description: string
  product_type: ProductType
  highlights: string[]
  meta_keywords: string
  is_active: boolean
  deleted_at: string | null
  variants: ProductVariant[]
  images: ProductImage[]
  image: string | null
  primary_image: string | null
  /** Null on a pre-order product: its arrived goods are per variant, on the Arrivals page. */
  total_stock: number | null
  price: string | null
  cost_price: string | null
  discount_price: string | null
}

/** ProductCreateSerializer (+ is_active on ProductUpdateSerializer; sku only on create). */
export interface ProductPayload {
  category_id?: string
  /** null clears the brand. */
  brand_id?: string | null
  featured?: boolean
  name?: string
  description?: string
  product_type?: ProductType
  highlights?: string[]
  meta_keywords?: string
  price?: string | null
  cost_price?: string
  discount_price?: string | null
  sku?: string
  is_active?: boolean
}

/** BrandSerializer */
export interface Brand {
  id: string
  name: string
  slug: string
  kind: CategoryType
  description: string
  is_active: boolean
  image: string | null
  deleted_at: string | null
}

export interface BrandPayload {
  name?: string
  kind?: CategoryType
  description?: string
  is_active?: boolean
}

/** BundleComponentSerializer */
export interface BundleComponent {
  component_variant_id: string
  component_sku: string
  component_name: string
  quantity: number
  component_price: string
  component_available: number
  component_image: string | null
}

/** BundleSerializer — `id` is the bundle's variant id. */
export interface Bundle {
  id: string
  product_id: string
  name: string
  category_id: string | null
  sku: string
  barcode: string
  description: string
  price: string
  cost_price: string
  is_active: boolean
  deleted_at: string | null
  discount_price: string | null
  effective_price: string
  available_stock: number
  images: ProductImage[]
  components: BundleComponent[]
}

/** BundleCreateSerializer / BundleUpdateSerializer */
export interface BundlePayload {
  category_id?: string
  name?: string
  sku?: string
  price?: string | null
  cost_price?: string | null
  discount_price?: string | null
  description?: string
  barcode?: string
  is_active?: boolean
  components?: { component_variant_id: string; quantity: number }[]
}

/** BulkActionMixin response */
export interface BulkActionResult {
  affected: number
}

/** AdminProductReviewSerializer — a customer's review of a product, written on the storefront. */
export interface ProductReview {
  id: string
  product_id: string
  product_name: string
  customer_id: string
  customer_name: string
  /** 1 to 5. */
  rating: number
  comment: string
  is_verified_purchase: boolean
  created_at: string
}

/** AdminProductQuestionSerializer — a customer's question about a product, asked on the storefront. */
export interface ProductQuestion {
  id: string
  product_id: string
  product_name: string
  customer_id: string
  customer_name: string
  question: string
  /** "" until staff answer it. */
  answer: string
  /** Shown on the storefront product page. Only an answered question can be published. */
  is_published: boolean
  answered_by_name: string
  answered_at: string | null
  created_at: string
}

/** The `status` filter of /admin/catalog/questions/, derived from `answer` and `is_published`. */
export type ProductQuestionStatus = "pending" | "answered" | "published"

export type PriceReportStatus = "open" | "resolved" | "dismissed"

/** AdminPriceReportSerializer — a customer's report of a suspected wrong price; staff-only. */
export interface PriceReport {
  id: string
  product_id: string
  product_name: string
  /** Null when the report is about the product as a whole. */
  variant_id: string | null
  variant_sku: string | null
  /** The variant's price right now (not when it was reported); null without a variant. */
  current_price: string | null
  expected_price: string | null
  comment: string
  reporter_id: string
  reporter_name: string
  status: PriceReportStatus
  staff_note: string
  resolved_by_name: string
  resolved_at: string | null
  created_at: string
}
