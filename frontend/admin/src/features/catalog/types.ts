// Mirrors kull-mart api/v1/admin/catalog/serializers.py + bundle_serializers.py.
// Money/decimal fields are strings (DRF DecimalField); ids are UUID strings.

export type ProductType = "simple" | "variant" | "bundle"
export type CategoryType = "stock" | "preorder"

export const productTypeOptions: { label: string; value: ProductType }[] = [
  { label: "Without options", value: "simple" },
  { label: "With options", value: "variant" },
  { label: "Bundle", value: "bundle" },
]

/** ProductImageSerializer */
export interface ProductImage {
  id: string
  product_id: string | null
  variant_id: string | null
  /** The option value this image shows for; null shows it for every choice. */
  option_value_id?: string | null
  url: string
  alt_text: string
  sort_order: number
}

export interface ProductOptionValue {
  id: string
  value: string
  position: number
}

export interface ProductOption {
  id: string
  name: string
  position: number
  values: ProductOptionValue[]
}

/** One picked value of a variant, in option order. */
export interface VariantOptionValue {
  option_id: string
  option_name: string
  value_id: string
  value: string
}

export interface ProductSpec {
  name: string
  value: string
}

/** GET products/<id>/combinations/ row; `variant_id` is null while the combination is not created. */
export interface Combination {
  value_ids: string[]
  title: string
  variant_id: string | null
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
  /** "Red / M"; "" on a product without options. */
  title: string
  option_values: VariantOptionValue[]
  wholesale_price: string | null
  show_wholesale_price: boolean
  is_preorder_enabled: boolean
  preorder_price: string | null
  preorder_start_date: string | null
  preorder_end_date: string | null
  release_date: string | null
  preorder_stock_limit: number | null
  /** Fewest units one pre-order may place; null on a stock variant. */
  preorder_min_quantity: number | null
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
  option_value_ids?: string[]
  is_active?: boolean
  wholesale_price?: string | null
  show_wholesale_price?: boolean
  is_preorder_enabled?: boolean
  preorder_price?: string | null
  preorder_start_date?: string | null
  preorder_end_date?: string | null
  release_date?: string | null
  preorder_stock_limit?: number | null
  preorder_min_quantity?: number
}

/** Left out, `combinations` means every missing one. */
export interface VariantGeneratePayload {
  combinations?: string[][]
  price?: string
  cost_price?: string
}

export interface VariantGenerateResult {
  created: ProductVariant[]
}

/** Left out, `variant_ids` means every live variant. */
export interface VariantBulkUpdatePayload {
  variant_ids?: string[]
  price?: string
  discount_price?: string | null
  cost_price?: string
  is_active?: boolean
}

/** An option of the Attributes page (Size, Colour, ...): owned by the shop, offered on the product form. */
export interface ShopOption {
  id: string
  name: string
  /** Off: kept in the list, but no longer offered when variants are generated. */
  is_active: boolean
  values: string[]
}

export interface ShopOptionPayload {
  name?: string
  values?: string[]
  is_active?: boolean
}

export interface ProductOptionsPayload {
  options: {
    id?: string
    name: string
    default_value?: string
    values: { id?: string; value: string }[]
  }[]
}

export interface ProductOptionsResult {
  options: ProductOption[]
  missing_combinations: number
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
  /** Whether the storefront product page shows its Questions / Price report sections. */
  show_questions: boolean
  show_price_report: boolean
  name: string
  slug: string
  description: string
  product_type: ProductType
  highlights: string[]
  options: ProductOption[]
  specs: ProductSpec[]
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
  /** Name (or email) of the staff member who created the product; null when nobody is on record. */
  added_by: string | null
  /** Units ordered less returns; carts and cancelled orders are left out. */
  units_sold: number
  average_rating: number | null
  review_count: number
}

/** ProductCreateSerializer (+ is_active on ProductUpdateSerializer; sku only on create). */
export interface ProductPayload {
  category_id?: string
  /** null clears the brand. */
  brand_id?: string | null
  featured?: boolean
  show_questions?: boolean
  show_price_report?: boolean
  name?: string
  description?: string
  highlights?: string[]
  specs?: ProductSpec[]
  /** Create only: the options and, by value text in option order, the combinations to make (left out = all). */
  options?: { name: string; values: string[] }[]
  combinations?: string[][]
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
  /** URLs of the pictures the customer attached, in upload order. */
  images: string[]
  is_verified_purchase: boolean
  /** "pending" waits for approval (when the shop approves reviews first), "hidden" was taken down by staff. */
  status: ProductReviewStatus
  /** Why staff hid it. Internal: never shown on the storefront. */
  moderation_note: string
  moderated_at: string | null
  moderated_by_id: string | null
  created_at: string
}

/** ProductReview.Status on the backend. Staff can only move a review to published or hidden. */
export type ProductReviewStatus = "pending" | "published" | "hidden"

/** AdminProductReviewModerationSerializer */
export interface ProductReviewModerationPayload {
  status: Exclude<ProductReviewStatus, "pending">
  note?: string
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
