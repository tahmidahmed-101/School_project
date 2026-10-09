import type { BrandInfo } from "@/lib/brand";
import { shopListing } from "@/lib/product";
import type { Catalog } from "@/modules/catalog/server";
import { SITE_DESCRIPTION, SITE_NAME } from "./metadata";
import { absoluteUrl } from "@/lib/site-url";

/** Plain-text site summary for AI crawlers and LLM assistants, following the llms.txt convention. */
export function buildLlmsTxt({ products: PRODUCTS, categories: CATEGORIES }: Catalog, BRAND_INFO: BrandInfo): string {
  const categoryLines = (kind: "stock" | "preorder") =>
    CATEGORIES.filter((category) => category.type === kind)
      .map((category) => `- ${category.name.en}: ${absoluteUrl(shopListing(kind, { category: category.slug }))}`)
      .join("\n");
  const count = (kind: "stock" | "preorder") => ({
    products: PRODUCTS.filter((product) => product.kind === kind).length,
    categories: CATEGORIES.filter((category) => category.type === kind).length,
  });
  const stock = count("stock");
  const preorder = count("preorder");

  const sections = [
    `# ${SITE_NAME}`,
    `> ${SITE_DESCRIPTION}`,
    [
      "## Sections",
      "",
      `- Shop (in-stock products): ${absoluteUrl("/shop")}`,
      `- Pre-order collection: ${absoluteUrl("/pre-order")} (all pre-order items: ${absoluteUrl("/shop?type=preorder")})`,
      `- Product pages: ${absoluteUrl("/product/{slug}")} — full details, price, specs and images`,
      `- Product feed (machine-readable): ${absoluteUrl("/products.xml")}`,
    ].join("\n"),
    ["## Shop categories (in stock)", "", categoryLines("stock")].join("\n"),
    ["## Pre-order categories", "", categoryLines("preorder")].join("\n"),
    [
      "## Catalogue",
      "",
      `- Shop: ${stock.products} in-stock products across ${stock.categories} categories`,
      `- Pre-order: ${preorder.products} pre-order products across ${preorder.categories} categories`,
      `- Prices in Bangladeshi Taka (BDT)`,
    ].join("\n"),
    [
      "## Contact",
      "",
      `- Email: ${BRAND_INFO.email}`,
      `- Phone: ${BRAND_INFO.phoneInternational}`,
      `- WhatsApp: https://wa.me/${BRAND_INFO.whatsapp}`,
      `- Address: ${BRAND_INFO.address.en}`,
      `- Facebook: ${BRAND_INFO.facebook}`,
    ].join("\n"),
    ["## Languages", "", "Site content is available in English and Bengali (bn)."].join("\n"),
  ];

  return `${sections.join("\n\n")}\n`;
}
