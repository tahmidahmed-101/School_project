import { createAsyncThunk } from "@reduxjs/toolkit"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"

/** POST `<endpoint><id>/restore/` — un-soft-deletes a record and returns it. */
export function createRestoreThunk<T>(name: string, endpoint: string) {
  return createAsyncThunk(`${name}/restore`, async (id: string, { rejectWithValue }) => {
    try {
      const res = await api.post(`${endpoint}${id}/restore/`)
      return unwrapItem<T>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  })
}
