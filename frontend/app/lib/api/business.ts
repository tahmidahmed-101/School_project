import { apiRequest } from "./client";
import type { ApiBusinessProfile } from "./types";

/** GET /business-profile/ — contact details for the storefront. */
export const getBusinessProfile = () =>
  apiRequest<ApiBusinessProfile>("/business-profile/", { revalidate: 300, tags: ["business"] });
