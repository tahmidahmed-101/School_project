export type Lang = "en" | "bn";

export type T = {
  en: string;
  bn: string;
};

/** Category slug from the API (categories are data now, not a fixed list). */
type ProductCategory = string;

export interface ProductVariant {
  name: T;
  options: {
    label: T;
    value: string;
    inStock?: boolean;
  }[];
}

/** One purchasable SKU from the API (colour / size combination). Checkout needs its `id`. */
export interface SkuVariant {
  id: string;
  sku: string;
  color: string;
  size: string;
  price: number;
  compareAtPrice?: number;
  /** Purchasable right now: in stock, or inside an active pre-order window. */
  inStock: boolean;
  isPreOrder: boolean;
  preorderEndDate?: string;
  expectedDelivery?: T;
  preorderCloses?: T;
  preorderStatus?: "available" | "closing-soon" | "sold-out";
}

export interface ProductSpec {
  label: T;
  value: T;
}

export interface Product {
  id: string;
  slug: string;
  name: T;
  tagline: T;
  description: T;
  longDescription: T;
  price: number;
  compareAtPrice?: number;
  category: ProductCategory;
  categoryName: T;
  image: string;
  gallery: string[];
  rating: number;
  reviewCount: number;
  inStock: boolean;
  stockCount: number;
  sku: string;
  /** Customer-facing code and short type label, e.g. 1001 (Earbuds). */
  productCode?: number;
  productType?: T;
  badge?: T;
  featured?: boolean;
  trending?: boolean;
  newArrival?: boolean;
  /** Option-group view (Colour / Size) of `skuVariants`, for the existing variant picker. */
  variants?: ProductVariant[];
  /** Backend SKU variants. Empty for legacy/local products, which cannot be ordered through the API. */
  skuVariants?: SkuVariant[];
  /** SKU shown by default (first purchasable one); the price/stock fields above describe it. */
  defaultVariantId?: string;
  specs?: ProductSpec[];
  highlights?: T[];
  // Pre-order attributes
  isPreOrder?: boolean;
  preorderEndDate?: string;
  expectedDeliveryStart?: string;
  expectedDeliveryEnd?: string;
  expectedDelivery?: T;
  preorderCloses?: T;
  maxPreorderQuantity?: number;
  currentPreorderQuantity?: number;
  preorderStatus?: "available" | "closing-soon" | "sold-out";
}

export interface CategoryInfo {
  /** Equal to `slug`: the shop filter and product.category both use it. */
  id: ProductCategory;
  /** Backend category UUID, for the API's `category_id` filter. */
  apiId?: string;
  slug: string;
  name: T;
  description: T;
  image: string;
  itemCount: number;
  accent: string;
}

export interface CartItem {
  /** Snapshot of the product with the chosen SKU's price / stock / pre-order state applied. */
  product: Product;
  quantity: number;
  /** Option-group selection (e.g. { Colour: "Black" }), used for display and line identity. */
  selectedVariant?: Record<string, string>;
  /** Backend variant UUID, sent as `variant_id` at checkout. */
  variantId: string;
}

/** Checkout form, mirroring the fields POST /checkout/ needs. */
export interface OrderForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** BD district; sent as shipping_address.city (the backend matches shipping zones on line1 + city). */
  district: string;
  postalCode: string;
  address: string;
  notes: string;
}

/** Backend-confirmed order, shown after a successful POST /checkout/. */
export interface OrderResult {
  orderNumber: string;
  status: string;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  district: string;
  lines: { id: string; name: string; sku: string; quantity: number; unitPrice: number; total: number; isPreOrder: boolean }[];
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  couponCode: string | null;
  shipments: { id: string; carrier: string | null; trackingNumber: string; status: string }[];
}
