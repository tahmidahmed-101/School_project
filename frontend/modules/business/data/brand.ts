import "server-only";
import { cache } from "react";
import { mergeBrand, type BrandInfo } from "@/lib/brand";
import { getBusinessProfile } from "./queries";

/** Contact details for the storefront, merged over the built-in defaults; the defaults alone if the API is down. */
export const getBrand = cache(async (): Promise<BrandInfo> => {
  try {
    return mergeBrand(await getBusinessProfile());
  } catch {
    return mergeBrand(null);
  }
});
