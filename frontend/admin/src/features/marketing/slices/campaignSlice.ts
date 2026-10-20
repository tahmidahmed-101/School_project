import {
  createActionThunk,
  createApiThunk,
  createSliceFactory,
  replaceOnFulfilled,
  withExtraCases,
} from "@/lib/sliceFactory"
import { api } from "@/lib/api/client"
import { invalidateAllPages } from "@/hooks/use-all-pages"
import type { EmailCampaign } from "../types"

// /admin/marketing/campaigns/ — list filters: search (name, subject), status, ordering
// (created_at, scheduled_at). PATCH/DELETE on /{id}/ work on drafts only. Sending happens in
// the backend's `send_campaigns` run, never in a request.
export const CAMPAIGNS_ENDPOINT = "/admin/marketing/campaigns/"
const ENDPOINT = CAMPAIGNS_ENDPOINT

const { reducer, fetchAll, fetchSingle, postData, patchData, deleteData } = createSliceFactory<EmailCampaign>({
  name: "campaigns",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll, fetchSingle, postData, patchData, deleteData }

/** Queue a draft. Without `send_at` it goes out with the next sender run. */
export const scheduleCampaign = createApiThunk<{ id: string; send_at: string | null }, EmailCampaign>(
  "campaigns/schedule",
  async ({ id, send_at }) => {
    const res = await api.post(`${ENDPOINT}${id}/schedule/`, send_at ? { send_at } : {})
    invalidateAllPages(ENDPOINT)
    return res
  }
)
export const unscheduleCampaign = createActionThunk<EmailCampaign>("campaigns/unschedule", ENDPOINT, "unschedule")
export const cancelCampaign = createActionThunk<EmailCampaign>("campaigns/cancel", ENDPOINT, "cancel")

export default withExtraCases(reducer, (builder) => {
  replaceOnFulfilled(builder, scheduleCampaign, unscheduleCampaign, cancelCampaign)
})
