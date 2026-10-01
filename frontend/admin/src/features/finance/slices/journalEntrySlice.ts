import { createAsyncThunk } from "@reduxjs/toolkit"
import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import type { JournalEntry, JournalEntryCreatePayload, JournalEntryReversePayload } from "../types"

const ENDPOINT = "/admin/accounting/journal-entries/"

// Journal entries are append-only: the backend posts them immediately and never edits or
// deletes them — corrections go through a reversing entry.
const { reducer, fetchAll, fetchSingle } = createSliceFactory<JournalEntry>({
  name: "journalEntries",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll, fetchSingle }

export const createJournalEntry = createAsyncThunk(
  "journalEntries/create",
  async (payload: JournalEntryCreatePayload, { rejectWithValue }) => {
    try {
      const res = await api.post(ENDPOINT, payload)
      return unwrapItem<JournalEntry>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const reverseJournalEntry = createAsyncThunk(
  "journalEntries/reverse",
  async ({ id, payload }: { id: string; payload: JournalEntryReversePayload }, { rejectWithValue }) => {
    try {
      const res = await api.post(`${ENDPOINT}${id}/reverse/`, payload)
      return unwrapItem<JournalEntry>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export default withExtraCases(reducer, (builder) => {
  builder
    .addCase(createJournalEntry.fulfilled, (state, action) => {
      state.data = [action.payload, ...state.data]
      state.totalItems += 1
    })
    .addCase(reverseJournalEntry.fulfilled, (state, action) => {
      const reversal = action.payload
      state.data = [
        reversal,
        ...state.data.map((e) => (e.id === reversal.reverses_id ? { ...e, reversed_by_id: reversal.id } : e)),
      ]
      state.totalItems += 1
      const single = state.singleData as JournalEntry | null
      if (single && single.id === reversal.reverses_id) {
        state.singleData = { ...single, reversed_by_id: reversal.id }
      }
    })
})
