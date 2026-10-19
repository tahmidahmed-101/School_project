import type { CategoryInfo, Product, ProductOption, ProductSale, ProductSpec, SkuVariant, T } from "@/lib/types";
import { toNumber } from "@/lib/api/parse";
import { normalizeImageUrl } from "@/lib/photo";
import { ORDER_QUANTITY_CAP, applyVariant } from "@/lib/variants";
import type { ApiCategory, ApiProduct, ApiProductOption, ApiProductSale, ApiVariant } from "@/lib/api/types";

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

// Lives in lib so other modules' adapters (the storefront popup) share it; re-exported for this module's callers.
export { normalizeImageUrl };

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

function toSkuVariant(v: ApiVariant, kind: Product["kind"]): SkuVariant {
  const isPreOrder = v.is_preorder_enabled && v.is_preorder_active;
  const isUpcoming = v.is_preorder_upcoming;
  // A pre-order product is only ever sold as a pre-order: outside its window it cannot be ordered at all.
  const inStock = isPreOrder || (kind !== "preorder" && !isUpcoming && v.in_stock);
  const price = toNumber(v.effective_price);
  const list = toNumber(v.price);
  const compareAt = v.compare_at_price ? toNumber(v.compare_at_price) : list > price ? list : undefined;

  let preorderStatus: SkuVariant["preorderStatus"];
  if (isPreOrder) {
    const end = v.preorder_end_date ? new Date(v.preorder_end_date).getTime() : NaN;
    if (v.preorder_remaining === 0) preorderStatus = "sold-out";
    else preorderStatus = Number.isFinite(end) && end - Date.now() <= CLOSING_SOON_MS ? "closing-soon" : "available";
  } else if (isUpcoming) {
    preorderStatus = "upcoming";
  } else if (kind === "preorder" || (v.is_preorder_enabled && !inStock)) {
    preorderStatus = "closed";
  }

  return {
    id: v.id,
    sku: v.sku,
    optionValueIds: (v.option_value_ids ?? []).map(String),
    title: v.title ?? "",
    price,
    compareAtPrice: compareAt && compareAt > price ? compareAt : undefined,
    salePrice: kind === "stock" && !isPreOrder && v.sale_price ? toNumber(v.sale_price) : undefined,
    inStock,
    isPreOrder,
    preorderEndDate: isPreOrder ? (v.preorder_end_date ?? undefined) : undefined,
    expectedDelivery: isPreOrder ? formatDate(v.release_date) : undefined,
    preorderCloses: isPreOrder ? formatDate(v.preorder_end_date) : undefined,
    maxPreorderQuantity: isPreOrder ? (v.preorder_stock_limit ?? undefined) : undefined,
    currentPreorderQuantity: isPreOrder ? v.preordered_quantity : undefined,
    minPreorderQuantity: isPreOrder ? (v.preorder_min_quantity ?? undefined) : undefined,
    preorderStatus,
  };
}

function toSale(sale: ApiProductSale | null | undefined): ProductSale | undefined {
  if (!sale?.name) return undefined;
  return { name: sale.name, percentOff: toNumber(sale.percent_off), endsAt: formatDate(sale.ends_at) };
}

// Ids can be UUIDs or the API's synthetic legacy strings, so they are only ever compared, never parsed.
function toOptions(options: ApiProductOption[] | undefined): ProductOption[] | undefined {
  const rows = (options ?? []).map((option) => ({
    id: String(option.id),
    name: option.name,
    values: (option.values ?? []).map((value) => ({ id: String(value.id), value: value.value })),
  }));
  return rows.length ? rows : undefined;
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

export function toCategoryInfo(category: ApiCategory, all: ApiCategory[] = []): CategoryInfo {
  const parent = category.parent_id ? all.find((c) => c.id === category.parent_id) : undefined;
  return {
    id: category.slug,
    apiId: category.id,
    ...(parent && { parentId: parent.slug }),
    slug: category.slug,
    name: plain(category.name),
    // The API has no category description.
    description: plain(""),
    image: category.image ? normalizeImageUrl(category.image) : CATEGORY_PLACEHOLDER_IMAGE,
    itemCount: category.product_count,
    type: category.category_type,
  };
}

export function toProduct(api: ApiProduct, categories: ApiCategory[]): Product {
  const skus = (api.variants ?? []).map((v) => toSkuVariant(v, api.kind));
  const preferred = skus.find((v) => v.inStock) ?? skus[0];
  const category = categories.find((c) => c.id === api.category_id);

  const images = [...(api.images ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((img) => ({ url: normalizeImageUrl(img.url), valueId: img.option_value_id }))
    .filter((img) => img.url);
  const gallery = images.map((img) => img.url);
  if (gallery.length === 0) gallery.push(PLACEHOLDER_IMAGE);
  const galleryByValue: Record<string, string[]> = {};
  for (const img of images) {
    if (img.valueId) (galleryByValue[String(img.valueId)] ??= []).push(img.url);
  }
  const highlights = (api.highlights ?? []).filter(Boolean).map(plain);

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
    kind: api.kind,
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
    options: toOptions(api.options),
    galleryByValue: Object.keys(galleryByValue).length ? galleryByValue : undefined,
    skuVariants: skus,
    defaultVariantId: preferred?.id,
    specs: toSpecs(api.specs),
    highlights: highlights.length ? highlights : undefined,
    metaKeywords: api.meta_keywords || undefined,
    showQuestions: api.show_questions,
    showPriceReport: api.show_price_report,
    sale: toSale(api.sale),
  };
  return applyVariant(base, preferred);
}

export function withReviewSummary(
  product: Product,
  summary: { average_rating: number | null; review_count: number },
): Product {
  return { ...product, rating: summary.average_rating ?? 0, reviewCount: summary.review_count };
}
