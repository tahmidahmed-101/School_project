import { createAsyncThunk } from "@reduxjs/toolkit"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"

/** POST to a record action endpoint (e.g. `restore/`, `submit/`) and return the updated record. */
export function createActionThunk<T>(type: string, endpoint: string, action: string) {
  return createAsyncThunk(type, async (id: string, { rejectWithValue }) => {
    try {
      const res = await api.post(`${endpoint}${id}/${action}/`)
      return unwrapItem<T>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  })
}
