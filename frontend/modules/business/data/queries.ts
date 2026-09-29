import { CACHE_LIFE, CACHE_TAGS } from "@/lib/cache";
import { apiRequest } from "@/lib/api/client";
import type { ApiBusinessProfile } from "@/lib/api/types";

/** GET /business-profile/ — contact details for the storefront. */
export const getBusinessProfile = () =>
  apiRequest<ApiBusinessProfile>("/business-profile/", {
    revalidate: CACHE_LIFE.business,
    tags: [CACHE_TAGS.business],
  });
