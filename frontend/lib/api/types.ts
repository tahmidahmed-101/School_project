/**
 * Wire types for the LaunchCart public storefront API (/api/v1/public).
 * Source of truth: "docs/Public API.yaml", corrected where the running backend differs (marked VERIFIED).
 * Decimals are strings on the wire; the adapters turn them into numbers.
 */

export interface ApiEnvelope<T> {
  data: T;
  message: string;
}

export interface ApiPage<T> {
  results: T[];
  count: number;
  next: string | null;
  previous: string | null;
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    /** VERIFIED: values are string arrays (the YAML says plain strings). */
    fields?: Record<string, string[] | string>;
  };
}

export interface ApiCategory {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  /** A subcategory always shares its root ancestor's type. */
  category_type: "stock" | "preorder";
}

interface ApiProductImage {
  url: string;
  alt_text: string;
  sort_order: number;
}

interface ApiBundleComponent {
  variant_id: string;
  sku: string;
  quantity: number;
  price: string;
}

export interface ApiVariant {
  id: string;
  sku: string;
  price: string;
  /** VERIFIED: returned by the backend but missing from the YAML. */
  compare_at_price?: string | null;
  discount_price: string | null;
  effective_price: string;
  in_stock: boolean;
  color: string;
  size: string;
  components: ApiBundleComponent[];
  is_bundle: boolean;
  is_preorder_enabled: boolean;
  preorder_price: string | null;
  preorder_start_date: string | null;
  preorder_end_date: string | null;
  release_date: string | null;
  is_preorder_active: boolean;
  is_preorder_price_applied: boolean;
  /** Pre-order cap; null when the pre-order has no limit. */
  preorder_stock_limit: number | null;
  /** Quantity already committed on non-cancelled orders. */
  preordered_quantity: number;
  /** `max(limit - preordered_quantity, 0)`; null when there is no limit. */
  preorder_remaining: number | null;
}

export interface ApiProduct {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  product_type: string;
  tagline: string;
  featured: boolean;
  trending: boolean;
  new_arrival: boolean;
  badge: string;
  specs: Record<string, unknown>;
  variants: ApiVariant[];
  images: ApiProductImage[];
  /** Present on the detail endpoint only. */
  description?: string;
  /** SEO keywords, comma separated. Present on the detail endpoint only. */
  meta_keywords?: string;
}

interface ApiReview {
  id: string;
  customer_name: string;
  rating: number;
  comment: string;
  is_verified_purchase: boolean;
  created_at: string;
}

export interface ApiReviewPage extends ApiPage<ApiReview> {
  average_rating: number | null;
  review_count: number;
}

export interface ProductListParams {
  search?: string;
  ordering?: "name" | "-name" | "created_at" | "-created_at";
  category_id?: string;
  preorder_only?: boolean;
  featured?: boolean;
  trending?: boolean;
  new_arrival?: boolean;
  badge?: "bestseller" | "popular" | "new" | "sale" | "limited" | "exclusive";
  page?: number;
  page_size?: number;
}

export interface ApiBusinessProfile {
  name: string;
  legal_name: string;
  tagline: string;
  logo_url: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  google_maps_url: string;
  opening_hours: string;
  address: string;
  social: Record<string, string>;
}

export interface ApiPaymentMethod {
  key: string;
  label: string;
  description: string;
}

export interface ApiCheckoutItem {
  variant_id: string;
  quantity: number;
}

interface ApiCheckoutAddress {
  full_name: string;
  phone: string;
  line1: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code: string;
  country?: string;
}

export interface ApiCheckoutRequest {
  email: string;
  phone: string;
  first_name: string;
  last_name?: string;
  items: ApiCheckoutItem[];
  shipping_address: ApiCheckoutAddress;
  /** Required. One of the keys from GET /payment-methods/ (cod, bkash, nagad, ...). */
  payment_method: string;
  carrier_id?: string | null;
  coupon_code?: string;
  notes?: string;
}

/** POST /checkout/coupon/ */
export interface ApiCouponPreview {
  code: string;
  discount_type: string;
  value: string;
  discount_amount: string;
  subtotal: string;
}

/** POST /checkout/shipping-quote/. `shipping_total` is null when no rate is configured for the zone. */
export interface ApiShippingQuote {
  zone: string;
  weight: string;
  carrier_id: string | null;
  shipping_total: string | null;
}

interface ApiOrderLine {
  id: string;
  product_name: string;
  variant_sku: string;
  quantity: number;
  unit_price: string;
  tax_amount: string;
  total: string;
  is_preorder: boolean;
}

interface ApiShipment {
  id: string;
  carrier_name: string | null;
  tracking_number: string;
  status: string;
  shipped_at: string | null;
  delivered_at: string | null;
}

export interface ApiOrder {
  id: string;
  order_number: string;
  status: "pending" | "awaiting_payment" | "confirmed" | "shipped" | "delivered" | "cancelled" | "closed";
  contact_email: string;
  contact_phone: string;
  subtotal: string;
  tax_total: string;
  shipping_total: string;
  discount_total: string;
  grand_total: string;
  coupon_code: string | null;
  lines: ApiOrderLine[];
  shipments: ApiShipment[];
}

export type ApiTrackStatus =
  "Placed" | "Confirmed" | "Packed" | "Shipped" | "In Transit" | "Out for Delivery" | "Delivered" | "Cancelled";

export interface ApiTrackOrder {
  order_number: string;
  status: ApiTrackStatus;
  created_at: string;
  items: { id: string; product_name: string; variant_sku: string; quantity: number; unit_price: string }[];
  shipments: ApiShipment[];
  delivery_info: {
    full_name: string;
    phone: string;
    line1: string;
    line2: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  } | null;
  tracking_timeline: { status: string; timestamp: string; description: string; tracking_number?: string }[];
}
