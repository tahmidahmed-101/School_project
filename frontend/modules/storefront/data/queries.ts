import { CACHE_LIFE, CACHE_TAGS } from "@/lib/cache";
import { apiRequest } from "@/lib/api/client";
import type { ApiStorefrontContent } from "@/lib/api/types";

/** GET /storefront-content/ — active hero slides and promo lines, already ordered. */
export const getStorefrontContentRaw = () =>
  apiRequest<ApiStorefrontContent>("/storefront-content/", {
    revalidate: CACHE_LIFE.storefrontContent,
    tags: [CACHE_TAGS.storefrontContent],
  });
