import { buildProductFeed } from "../lib/product-feed";

// The catalogue is static, so this feed can be generated once at build time instead of per request.
export const dynamic = "force-static";

/** Google Merchant Center / Meta Catalog product feed, for Google Shopping and Facebook/Instagram shop ads. */
export function GET(): Response {
  return new Response(buildProductFeed(), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
