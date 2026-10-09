import "server-only";
import { cache } from "react";
import { toStorefrontContent, type StorefrontContent } from "../domain/storefront-content";
import { getStorefrontContentRaw } from "./queries";

/** Dashboard-managed hero and promo content; null if the API is down. */
export const getStorefrontContent = cache(async (): Promise<StorefrontContent | null> => {
  try {
    return toStorefrontContent(await getStorefrontContentRaw());
  } catch {
    return null;
  }
});
