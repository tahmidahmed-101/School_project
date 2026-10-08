import type { ProductKind } from "@/lib/product";
import { shopKindFor } from "./shop-filters";

export interface PageKindInput {
  pathname: string;
  type?: string | null;
  category?: { type: ProductKind };
  product?: ProductKind | null;
  basket?: ProductKind | "mixed" | null;
}

const isUnder = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** Which shop the visitor is in. Pages of neither shop (home, login, tracking) count as stock; checkout follows its basket. */
export function pageShopKind({ pathname, type, category, product, basket }: PageKindInput): ProductKind {
  if (isUnder(pathname, "/pre-order")) return "preorder";
  if (isUnder(pathname, "/shop")) return shopKindFor(type, category);
  if (isUnder(pathname, "/product")) return product ?? "stock";
  if (isUnder(pathname, "/checkout")) return basket === "preorder" ? "preorder" : "stock";
  return "stock";
}
