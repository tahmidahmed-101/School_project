import "server-only";
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
