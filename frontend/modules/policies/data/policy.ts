import "server-only";
import { ApiError } from "@/lib/api/client";
import { getStorePolicy } from "@/lib/api/store-policy";
import type { ApiStorePolicy } from "@/lib/api/types";
import { CACHE_LIFE } from "@/lib/cache";
import { policyFromApi, type PolicyContent } from "../domain/policy-content";

/**
 * The published policy, so the policy page and the product page state the same terms. The storefront's own copy
 * stands in while the policy is unpublished (404) or the API is unreachable.
 */
export async function getPolicyContent(kind: ApiStorePolicy["kind"], fallback: PolicyContent): Promise<PolicyContent> {
  try {
    return policyFromApi(await getStorePolicy(kind, { revalidate: CACHE_LIFE.policies }));
  } catch {
    return fallback;
  }
}

/** The published policy, or null while staff have not published one; for a policy with no built-in copy. */
export async function getPublishedPolicy(kind: ApiStorePolicy["kind"]): Promise<PolicyContent | null> {
  try {
    return policyFromApi(await getStorePolicy(kind, { revalidate: CACHE_LIFE.policies }));
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) return null;
    throw error;
  }
}

// The API cache keeps successful answers only, and "unpublished" is a 404: without this, every page render
// (the footer and menu ask on each one) would go back to the backend for as long as the policy is unpublished.
const publishedMemo = new Map<ApiStorePolicy["kind"], { until: number; published: boolean }>();

/** Whether staff have published this policy, for nav links and the sitemap. False when the API is unreachable. */
export async function isPolicyPublished(kind: ApiStorePolicy["kind"]): Promise<boolean> {
  const known = publishedMemo.get(kind);
  if (known && known.until > Date.now()) return known.published;
  let published: boolean;
  try {
    await getStorePolicy(kind, { revalidate: CACHE_LIFE.policies });
    published = true;
  } catch (error) {
    if (!(error instanceof ApiError && error.isNotFound)) return false;
    published = false;
  }
  publishedMemo.set(kind, { until: Date.now() + CACHE_LIFE.policies * 1000, published });
  return published;
}
