export type Lang = "en" | "bn";

export type T = {
  en: string;
  bn: string;
};

/** Category slug from the API (categories are data now, not a fixed list). */
type ProductCategory = string;

export interface ProductOption {
  id: string;
  name: string;
  values: { id: string; value: string }[];
}

/** One purchasable SKU from the API (one value of every option). Checkout needs its `id`. */
export interface SkuVariant {
  id: string;
  sku: string;
  optionValueIds: string[];
  /** "Red / M"; "" for a product without options. */
  title: string;
  price: number;
  compareAtPrice?: number;
  /** Set when a running sale lowers this SKU's price. */
  salePrice?: number;
  /** Purchasable right now. */
  inStock: boolean;
}

export interface ProductSpec {
  label: T;
  value: T;
}

/** The running sale that makes a stock product cheaper. */
export interface ProductSale {
  name: string;
  percentOff: number;
  endsAt?: T;
}

/** One item inside a combo product. */
export interface BundleItem {
  slug: string;
  name: T;
  image: string;
  quantity: number;
  /** Price of one unit when bought on its own. */
  unitPrice: number;
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
  /** The chosen SKU's sale price; undefined when the sale does not cover it. */
  salePrice?: number;
  sale?: ProductSale;
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
  options?: ProductOption[];
  /** Photos that belong to one option value, by value id. */
  galleryByValue?: Record<string, string[]>;
  /** Backend SKU variants. Empty for legacy/local products, which cannot be ordered through the API. */
  skuVariants?: SkuVariant[];
  /** SKU shown by default (first purchasable one); the price/stock fields above describe it. */
  defaultVariantId?: string;
  specs?: ProductSpec[];
  highlights?: T[];
  /** SEO keywords from the product detail endpoint. */
  metaKeywords?: string;
  /** False when staff turned the Questions / Price report sections off for this product (detail endpoint only). */
  showQuestions?: boolean;
  showPriceReport?: boolean;
  /** What a combo is made of (detail endpoint only); undefined for an ordinary product. */
  bundleItems?: BundleItem[];
}

export interface CategoryInfo {
  /** Equal to `slug`: the shop filter and product.category both use it. */
  id: ProductCategory;
  /** Backend category UUID, for the API's `category_id` filter. */
  apiId?: string;
  /** `id` of the category this one sits under; absent on a main category. */
  parentId?: ProductCategory;
  slug: string;
  name: T;
  description: T;
  image: string;
  itemCount: number;
}

export interface CartItem {
  /** Snapshot of the product with the chosen SKU's price / stock state applied. */
  product: Product;
  quantity: number;
  variantTitle?: string;
  /** Backend variant UUID, sent as `variant_id` at checkout; also the line's identity. */
  variantId: string;
}

/** Checkout form, mirroring the fields POST /checkout/ needs. */
export interface OrderForm {
  /** The shopper's full name, as one field. */
  name: string;
  phone: string;
  /** BD district; sent as shipping_address.city (the backend matches shipping zones on line1 + city). */
  district: string;
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
  lines: {
    id: string;
    name: string;
    variantTitle: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  payTo: string;
  couponCode: string | null;
  shipments: { id: string; carrier: string | null; trackingNumber: string; status: string }[];
}
