export type Lang = "en" | "bn";

export type T = {
  en: string;
  bn: string;
};

export type ProductCategory =
  | "womens-fashion"
  | "bags-wallets"
  | "jewellery"
  | "kids"
  | "gadgets"
  | "lifestyle";

export interface ProductVariant {
  name: T;
  options: {
    label: T;
    value: string;
    inStock?: boolean;
  }[];
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
  variants?: ProductVariant[];
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
  id: ProductCategory;
  slug: string;
  name: T;
  description: T;
  image: string;
  itemCount: number;
  accent: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedVariant?: Record<string, string>;
}

export interface OrderForm {
  fullName: string;
  phoneNumber: string;
  deliveryAddress: string;
  cityArea: string;
  deliveryZone: "inside-dhaka" | "outside-dhaka";
  paymentMethod: "cod";
  deliveryNotes?: string;
}

export interface OrderResult {
  orderNumber: string;
  customer: OrderForm;
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  createdAt: string;
}
