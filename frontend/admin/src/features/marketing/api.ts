import { api, apiCall, extractApiError } from "@/lib/api/client"
import { unwrapList, type NormalizedList } from "@/lib/api/envelope"
import { CAMPAIGNS_ENDPOINT } from "./slices/campaignSlice"
import type { CampaignAudience, CampaignDelivery, CampaignTestResult, DeliveryStatus } from "./types"

/** Who the next campaign would reach. */
export const fetchCampaignAudience = (signal?: AbortSignal) =>
  apiCall<CampaignAudience>(() => api.get(`${CAMPAIGNS_ENDPOINT}audience/`, { signal }))

/** One `[Test]` copy to `recipient`, or to the signed-in staff member when empty. 5 per hour. */
export const sendCampaignTest = (id: string, recipient: string) =>
  apiCall<CampaignTestResult>(() =>
    api.post(`${CAMPAIGNS_ENDPOINT}${id}/test/`, recipient ? { recipient } : {})
  )

/** Each recipient's copy of a campaign, one page at a time. */
export async function fetchCampaignDeliveries(
  id: string,
  params: { page: number; page_size: number; status?: DeliveryStatus; search?: string },
  signal?: AbortSignal
): Promise<NormalizedList<CampaignDelivery>> {
  try {
    const res = await api.get(`${CAMPAIGNS_ENDPOINT}${id}/deliveries/`, { params, signal })
    return unwrapList<CampaignDelivery>(res.data, params.page, params.page_size)
  } catch (err) {
    throw extractApiError(err)
  }
}
