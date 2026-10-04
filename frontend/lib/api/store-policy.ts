import { apiRequest } from "@/lib/api/client";
import type { ApiStorePolicy } from "@/lib/api/types";

/**
 * GET /policies/{kind}/ — the policy staff published in the dashboard. Throws ApiError 404 (`policy_unavailable`)
 * while it is unpublished or incomplete, so callers keep their own fallback copy.
 */
export const getStorePolicy = (kind: ApiStorePolicy["kind"]) => apiRequest<ApiStorePolicy>(`/policies/${kind}/`);
