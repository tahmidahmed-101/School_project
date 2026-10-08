import type { CategoryInfo, Product, ProductSpec, ProductVariant, SkuVariant, T } from "@/lib/types";
import { toNumber } from "@/lib/api/parse";
import { publicEnv } from "@/lib/env";
import { COLOUR_GROUP, ORDER_QUANTITY_CAP, SIZE_GROUP, applyVariant, sortSizes } from "@/lib/variants";
import type { ApiCategory, ApiProduct, ApiVariant } from "@/lib/api/types";

/**
 * Backend -> storefront model. The UI keeps using `Product` / `CategoryInfo`; everything the API cannot supply
 * is left undefined so the components hide it (product code, ratings, bilingual text, ...), never invented.
 */

/** Text with no Bengali counterpart from the API: shown in every language until the backend provides one. */
// The API sends one language. Every reader falls back to `en` when `bn` is empty, so the text travels once.
const plain = (value: string): T => ({ en: value, bn: "" });

/** Shown when a product has no photo, so the card layout never breaks. */
const PLACEHOLDER_IMAGE = "brand/logo-mark.png";
/** Shown for a category with no picture of its own and no product picture to borrow. */
const CATEGORY_PLACEHOLDER_IMAGE = "brand/category-placeholder.png";

/**
 * Photos come back as `/media/...` or as absolute URLs. Media paths are made absolute on the API origin: the Cloudflare
 * image optimizer reads relative URLs from static assets only, so a proxied `/media/` path would 404 there.
 */
export function normalizeImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.startsWith("/media/")) return trimmed;
  try {
    return `${new URL(publicEnv.apiUrl ?? "").origin}${trimmed}`;
  } catch {
    return trimmed;
  }
}

/** "17 Oct 2026" / "১৭ অক্টো ২০২৬": locale date formatting of a real API date, not a translation. */
function formatDate(iso: string | null): T | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  const format = (locale: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" }).format(
      date,
    );
  return { en: format("en-GB"), bn: format("bn-BD") };
}

const CLOSING_SOON_MS = 3 * 24 * 60 * 60 * 1000;

function toSkuVariant(v: ApiVariant): SkuVariant {
  const isPreOrder = v.is_preorder_enabled && v.is_preorder_active;
  const price = toNumber(v.effective_price);
  const list = toNumber(v.price);
  const compareAt = v.compare_at_price ? toNumber(v.compare_at_price) : list > price ? list : undefined;

  let preorderStatus: SkuVariant["preorderStatus"];
  if (isPreOrder) {
    const end = v.preorder_end_date ? new Date(v.preorder_end_date).getTime() : NaN;
    if (v.preorder_remaining === 0) preorderStatus = "sold-out";
    else preorderStatus = Number.isFinite(end) && end - Date.now() <= CLOSING_SOON_MS ? "closing-soon" : "available";
  }

  return {
    id: v.id,
    sku: v.sku,
    color: v.color,
    size: v.size,
    price,
    compareAtPrice: compareAt && compareAt > price ? compareAt : undefined,
    // Pre-order SKUs skip warehouse stock, so `in_stock` is irrelevant while their window is open. A pre-order SKU
    // whose window is closed or not yet open cannot be bought (the backend rejects it).
    inStock: v.is_preorder_enabled ? v.is_preorder_active : v.in_stock,
    isPreOrder,
    preorderEndDate: isPreOrder ? (v.preorder_end_date ?? undefined) : undefined,
    expectedDelivery: isPreOrder ? formatDate(v.release_date) : undefined,
    preorderCloses: isPreOrder ? formatDate(v.preorder_end_date) : undefined,
    maxPreorderQuantity: isPreOrder ? (v.preorder_stock_limit ?? undefined) : undefined,
    currentPreorderQuantity: isPreOrder ? v.preordered_quantity : undefined,
    preorderStatus,
  };
}

/** Colour / Size option groups for the existing variant picker, built from the SKU list. */
function optionGroups(skus: SkuVariant[]): ProductVariant[] | undefined {
  const groups: ProductVariant[] = [];
  const build = (name: T, pick: (v: SkuVariant) => string, order: (values: string[]) => string[] = (v) => v) => {
    const values = order([...new Set(skus.map(pick).filter(Boolean))]);
    // A single value is not a choice, so no picker is shown.
    if (values.length < 2) return;
    groups.push({
      name,
      options: values.map((value) => ({
        label: plain(value),
        value,
        inStock: skus.some((v) => pick(v) === value && v.inStock),
      })),
    });
  };
  build({ en: COLOUR_GROUP, bn: "রং" }, (v) => v.color);
  build({ en: SIZE_GROUP, bn: "সাইজ" }, (v) => v.size, sortSizes);
  return groups.length ? groups : undefined;
}

/** "screen_size" -> "Screen size": formatting of an API key, not a translation. */
function humanizeKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function toSpecs(specs: Record<string, unknown> | null | undefined): ProductSpec[] | undefined {
  const rows = Object.entries(specs ?? {})
    .map(([key, value]) => {
      const text = Array.isArray(value) ? value.join(", ") : value === null || value === undefined ? "" : String(value);
      return text ? { label: plain(humanizeKey(key)), value: plain(text) } : null;
    })
    .filter((row): row is ProductSpec => row !== null);
  return rows.length ? rows : undefined;
}

/** Badge is a fixed enum on the API side (`bestseller`, `new`, ...), shown as its English word in both languages. */
function toBadge(badge: string): T | undefined {
  if (!badge) return undefined;
  const label = badge.charAt(0).toUpperCase() + badge.slice(1);
  return plain(label);
}

export function toCategoryInfo(category: ApiCategory, products: Product[] = []): CategoryInfo {
  const inCategory = products.filter((p) => p.category === category.slug);
  const withImage = inCategory.find((p) => p.image !== PLACEHOLDER_IMAGE);
  const counted = category.product_count !== undefined;
  const apiImage = category.image ? normalizeImageUrl(category.image) : CATEGORY_PLACEHOLDER_IMAGE;
  return {
    id: category.slug,
    apiId: category.id,
    slug: category.slug,
    name: plain(category.name),
    // The API has no category description. Count and picture come from the API; an API deployed before those
    // fields existed leaves them out, and the product list stands in.
    description: plain(""),
    image: counted ? apiImage : (withImage?.image ?? CATEGORY_PLACEHOLDER_IMAGE),
    itemCount: category.product_count ?? inCategory.length,
    type: category.category_type,
  };
}

export function toProduct(api: ApiProduct, categories: ApiCategory[]): Product {
  const skus = (api.variants ?? []).map(toSkuVariant);
  const preferred = skus.find((v) => v.inStock) ?? skus[0];
  const category = categories.find((c) => c.id === api.category_id);

  const gallery = [...(api.images ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((img) => normalizeImageUrl(img.url))
    .filter(Boolean);
  if (gallery.length === 0) gallery.push(PLACEHOLDER_IMAGE);

  const description = plain(api.description ?? "");
  const base: Product = {
    id: api.id,
    slug: api.slug,
    name: plain(api.name),
    tagline: plain(api.tagline ?? ""),
    description,
    longDescription: description,
    price: preferred?.price ?? 0,
    compareAtPrice: preferred?.compareAtPrice,
    category: category?.slug ?? "",
    categoryName: plain(category?.name ?? ""),
    image: gallery[0]!,
    gallery,
    // No rating/review aggregate on list or detail payloads; the reviews endpoint supplies it (see withReviewSummary).
    rating: 0,
    reviewCount: 0,
    inStock: skus.some((v) => v.inStock),
    stockCount: skus.some((v) => v.inStock) ? ORDER_QUANTITY_CAP : 0,
    sku: preferred?.sku ?? "",
    // productCode / productType: not provided by the API (product_type is an internal enum), so left unset.
    badge: toBadge(api.badge),
    featured: api.featured,
    trending: api.trending,
    newArrival: api.new_arrival,
    variants: optionGroups(skus),
    skuVariants: skus,
    defaultVariantId: preferred?.id,
    specs: toSpecs(api.specs),
    metaKeywords: api.meta_keywords || undefined,
  };
  return applyVariant(base, preferred);
}

export function withReviewSummary(
  product: Product,
  summary: { average_rating: number | null; review_count: number },
): Product {
  return { ...product, rating: summary.average_rating ?? 0, reviewCount: summary.review_count };
}
