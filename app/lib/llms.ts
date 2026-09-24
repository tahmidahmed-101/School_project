import { BRAND_INFO, CATEGORIES, PRODUCTS } from "./data";
import { SITE_DESCRIPTION, SITE_NAME } from "./seo";
import { absoluteUrl } from "./site-url";

/** Plain-text site summary for AI crawlers and LLM assistants, following the llms.txt convention. */
export function buildLlmsTxt(): string {
  const categoryLines = CATEGORIES.map(
    (category) => `- ${category.name.en}: ${absoluteUrl(`/shop?category=${category.slug}`)}`,
  ).join("\n");

  const preOrderCount = PRODUCTS.filter((p) => p.isPreOrder).length;

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
    ["## Categories", "", categoryLines].join("\n"),
    [
      "## Catalogue",
      "",
      `- ${PRODUCTS.length} products across ${CATEGORIES.length} categories`,
      `- ${preOrderCount} available for pre-order`,
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
