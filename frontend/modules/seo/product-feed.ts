import { CURRENCY_CODE, SITE_DESCRIPTION, SITE_NAME, assetUrl } from "./metadata";
import { absoluteUrl } from "@/lib/site-url";
import type { Product } from "@/lib/types";

const MAX_ADDITIONAL_IMAGES = 10;

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};
const escapeXml = (value: string) => value.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);

const tag = (name: string, value: string) => `<g:${name}>${escapeXml(value)}</g:${name}>`;

/** Google Merchant Center / Meta Catalog availability value. */
function availability(product: Product): string {
  return product.inStock && product.stockCount > 0 ? "in stock" : "out of stock";
}

function item(product: Product): string {
  const money = (amount: number) => `${amount.toFixed(2)} ${CURRENCY_CODE}`;
  const [image, ...extraImages] = product.gallery.map(assetUrl);
  const onSale = product.compareAtPrice != null && product.compareAtPrice > product.price;

  const lines = [
    tag("id", product.id),
    tag("title", product.name.en),
    // List payloads carry no description; the feed still needs one, so fall back to the tagline, then the name.
    tag("description", product.description.en || product.tagline.en || product.name.en),
    tag("link", absoluteUrl(`/product/${product.slug}`)),
    ...(image ? [tag("image_link", image)] : []),
    ...extraImages.slice(0, MAX_ADDITIONAL_IMAGES).map((url) => tag("additional_image_link", url)),
    tag("price", money(onSale ? product.compareAtPrice! : product.price)),
    ...(onSale ? [tag("sale_price", money(product.price))] : []),
    tag("availability", availability(product)),
    tag("brand", SITE_NAME),
    ...(product.productCode ? [tag("mpn", String(product.productCode))] : []),
    tag("condition", "new"),
    tag("product_type", product.categoryName.en),
  ];
  return `<item>\n${lines.map((l) => `  ${l}`).join("\n")}\n</item>`;
}

/** Google Merchant Center / Meta Catalog product feed (RSS 2.0 + the "g:" namespace). */
export function buildProductFeed(products: Product[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "<channel>",
    `<title>${escapeXml(SITE_NAME)}</title>`,
    `<link>${escapeXml(absoluteUrl("/"))}</link>`,
    `<description>${escapeXml(SITE_DESCRIPTION)}</description>`,
    ...products.filter((p) => p.sku).map(item),
    "</channel>",
    "</rss>",
  ].join("\n");
}
