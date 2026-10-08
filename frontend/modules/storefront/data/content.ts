import "server-only";
import { cache } from "react";
import { toStorefrontContent, type StorefrontContent } from "../domain/storefront-content";
import { getStorefrontContentRaw } from "./queries";

/** Dashboard-managed hero and promo content; null if the API is down or lacks the endpoint, so pages use the built-in content. */
export const getStorefrontContent = cache(async (): Promise<StorefrontContent | null> => {
  try {
    return toStorefrontContent(await getStorefrontContentRaw());
  } catch {
    return null;
  }
});
