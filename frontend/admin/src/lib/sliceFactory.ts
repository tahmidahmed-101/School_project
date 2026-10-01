import {
  createAsyncThunk,
  createReducer,
  createSlice,
  type ActionReducerMapBuilder,
  type Draft,
  type Reducer,
} from "@reduxjs/toolkit"
import { generateId } from "@/lib/utils"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapList, unwrapItem, type ListMeta } from "@/lib/api/envelope"

interface WithId {
  id: string
}

interface FetchAllParams {
  page?: number
  page_size?: number
  search?: string
  [key: string]: unknown
}

/**
 * Two modes, selected by whether `endpoint` is passed:
 *  - `endpoint` present: thunks call the real backend (used by migrated slices).
 *  - `endpoint` absent (`seed` only): thunks operate purely in-memory (legacy/not-yet-migrated slices).
 * The consumer-facing contract ({reducer, fetchAll, fetchSingle, postData, updateData, patchData, deleteData})
 * and state shape are identical either way, so components never need to change when a slice migrates.
 */
export function createSliceFactory<T extends WithId>({
  name,
  endpoint,
  seed = [],
  initialSingleData,
}: {
  name: string
  endpoint?: string
  seed?: T[]
  /**
   * Initial `singleData`. Defaults to an empty object (the original behavior). Domains whose
   * components distinguish "not loaded yet" from "loaded" by checking `!singleData` must pass
   * `null` here, otherwise an empty object is truthy and detail pages render as broken.
   */
  initialSingleData?: T | null
}) {
  const resourceUrl = (id: string) => `${endpoint}${id}/`

  const fetchAll = createAsyncThunk(
    `${name}/fetchAll`,
    async (params: FetchAllParams | undefined, { getState, rejectWithValue }) => {
      if (endpoint) {
        try {
          const { page = 1, page_size = 20, ...rest } = params ?? {}
          const res = await api.get(endpoint, { params: { page, page_size, ...rest } })
          const { items, meta } = unwrapList<T>(res.data, page, page_size)
          return { data: items, total: meta.count, meta }
        } catch (err) {
          return rejectWithValue(extractApiError(err))
        }
      }

      const state = getState() as Record<string, { data: T[] } | undefined>
      const list = state[name]?.data ?? seed
      const search = params?.search?.trim().toLowerCase()

      const filtered = search
        ? list.filter((item) =>
            Object.values(item as Record<string, unknown>).some(
              (value) => typeof value === "string" && value.toLowerCase().includes(search)
            )
          )
        : list

      return { data: filtered, total: filtered.length, meta: null as ListMeta | null }
    }
  )

  const fetchSingle = createAsyncThunk(
    `${name}/fetchSingle`,
    async (id: string, { getState, rejectWithValue }) => {
      if (endpoint) {
        try {
          const res = await api.get(resourceUrl(id))
          return unwrapItem<T>(res.data)
        } catch (err) {
          return rejectWithValue(extractApiError(err))
        }
      }

      const state = getState() as Record<string, { data: T[] } | undefined>
      const list = state[name]?.data ?? seed
      const item = list.find((i) => i.id === id)
      if (!item) {
        return rejectWithValue({ error: `${name} item "${id}" not found` })
      }
      return item
    }
  )

  const postData = createAsyncThunk(
    `${name}/postData`,
    async (
      { payload, onSuccess }: { payload: Partial<T>; onSuccess?: () => void },
      { rejectWithValue }
    ) => {
      if (endpoint) {
        try {
          const res = await api.post(endpoint, payload)
          const item = unwrapItem<T>(res.data)
          onSuccess?.()
          return item
        } catch (err) {
          return rejectWithValue(extractApiError(err))
        }
      }

      const newItem = { ...payload, id: payload.id ?? generateId(name.toUpperCase()) } as T
      onSuccess?.()
      return newItem
    }
  )

  const updateData = createAsyncThunk(
    `${name}/updateData`,
    async ({ id, payload }: { id: string; payload: Partial<T> }, { getState, rejectWithValue }) => {
      if (endpoint) {
        try {
          const res = await api.put(resourceUrl(id), payload)
          return unwrapItem<T>(res.data)
        } catch (err) {
          return rejectWithValue(extractApiError(err))
        }
      }

      // Merge so fields absent from a partial payload aren't dropped from the record.
      const state = getState() as Record<string, { data: T[] } | undefined>
      const existing = (state[name]?.data ?? seed).find((i) => i.id === id)
      return { ...(existing as object), ...payload, id } as T
    }
  )

  const patchData = createAsyncThunk(
    `${name}/patchData`,
    async ({ id, payload }: { id: string; payload: Partial<T> }, { getState, rejectWithValue }) => {
      if (endpoint) {
        try {
          const res = await api.patch(resourceUrl(id), payload)
          return unwrapItem<T>(res.data)
        } catch (err) {
          return rejectWithValue(extractApiError(err))
        }
      }

      const state = getState() as Record<string, { data: T[] } | undefined>
      const list = state[name]?.data ?? seed
      const existing = list.find((i) => i.id === id)
      return { ...(existing as object), ...payload, id } as T
    }
  )

  const deleteData = createAsyncThunk(
    `${name}/deleteData`,
    async (id: string, { rejectWithValue }) => {
      if (endpoint) {
        try {
          await api.delete(resourceUrl(id))
          return id
        } catch (err) {
          return rejectWithValue(extractApiError(err))
        }
      }
      return id
    }
  )

  type SingleStatus = "idle" | "loading" | "succeeded" | "failed"
  const emptySingle = (initialSingleData === undefined ? ({} as T) : initialSingleData) as unknown as
    | T
    | Record<string, never>

  const initialState = {
    data: seed, // For list of items
    singleData: emptySingle, // For single item details
    // True while ANY request is in flight. Counter-backed so one request finishing can't
    // clear the flag while another (e.g. a detail fetch next to a list fetch) is pending.
    isLoading: false,
    pendingCount: 0,
    isFetchingList: false,
    isMutating: false,
    // Lets detail pages tell "not loaded yet" / "not found" / "request failed" apart.
    singleStatus: "idle" as SingleStatus,
    singleError: null as unknown,
    error: null as unknown, // Error handling
    totalItems: seed.length,
    meta: null as ListMeta | null, // server pagination info, populated once endpoint-backed
    // requestId of the latest list/detail fetch; responses from older requests are dropped.
    listRequestId: null as string | null,
    singleRequestId: null as string | null,
  }
  type State = typeof initialState

  const start = (state: Draft<State>) => {
    state.pendingCount += 1
    state.isLoading = true
  }
  const finish = (state: Draft<State>) => {
    state.pendingCount = Math.max(0, state.pendingCount - 1)
    state.isLoading = state.pendingCount > 0
  }
  const replaceItem = (state: Draft<State>, item: T) => {
    state.data = state.data.map((existing) => (existing.id === item.id ? (item as Draft<T>) : existing)) as typeof state.data
    if ((state.singleData as Partial<WithId>)?.id === item.id) {
      state.singleData = item as typeof state.singleData
    }
  }

  const slice = createSlice({
    name,
    initialState,
    reducers: {},
    extraReducers: (builder) => {
      return builder
        // Fetch All
        .addCase(fetchAll.pending, (state, action) => {
          start(state)
          state.isFetchingList = true
          state.listRequestId = action.meta.requestId
        })
        .addCase(fetchAll.fulfilled, (state, action) => {
          finish(state)
          if (state.listRequestId !== action.meta.requestId) return
          state.isFetchingList = false
          state.data = action.payload.data as typeof state.data
          state.totalItems = action.payload.total
          state.meta = action.payload.meta
          state.error = null
        })
        .addCase(fetchAll.rejected, (state, action) => {
          finish(state)
          if (state.listRequestId !== action.meta.requestId) return
          state.isFetchingList = false
          if (action.meta.aborted) return
          state.error = action.payload ?? action.error
        })

        // Fetch Single
        .addCase(fetchSingle.pending, (state, action) => {
          start(state)
          state.singleRequestId = action.meta.requestId
          state.singleStatus = "loading"
          state.singleError = null
          // Don't keep showing the previously viewed record while a different one loads.
          if ((state.singleData as Partial<WithId>)?.id !== action.meta.arg) {
            state.singleData = emptySingle as typeof state.singleData
          }
        })
        .addCase(fetchSingle.fulfilled, (state, action) => {
          finish(state)
          if (state.singleRequestId !== action.meta.requestId) return
          state.singleData = action.payload as typeof state.singleData
          state.singleStatus = "succeeded"
          state.error = null
        })
        .addCase(fetchSingle.rejected, (state, action) => {
          finish(state)
          if (state.singleRequestId !== action.meta.requestId) return
          state.singleStatus = "failed"
          state.singleError = action.payload ?? action.error
          state.error = state.singleError
        })

        // Post Data
        .addCase(postData.pending, (state) => {
          start(state)
          state.isMutating = true
        })
        .addCase(postData.fulfilled, (state, action) => {
          finish(state)
          state.isMutating = false
          // Only prepend while the first page is showing; on later pages the new row
          // belongs elsewhere in the server's ordering.
          if (!state.meta || state.meta.page <= 1) {
            state.data = [action.payload, ...state.data] as typeof state.data
          }
          state.totalItems += 1
          state.error = null
        })
        .addCase(postData.rejected, (state, action) => {
          finish(state)
          state.isMutating = false
          state.error = action.payload ?? action.error
        })

        // Update Data
        .addCase(updateData.pending, (state) => {
          start(state)
          state.isMutating = true
        })
        .addCase(updateData.fulfilled, (state, action) => {
          finish(state)
          state.isMutating = false
          replaceItem(state, action.payload)
          state.error = null
        })
        .addCase(updateData.rejected, (state, action) => {
          finish(state)
          state.isMutating = false
          state.error = action.payload ?? action.error
        })

        // Patch Data
        .addCase(patchData.pending, (state) => {
          start(state)
          state.isMutating = true
        })
        .addCase(patchData.fulfilled, (state, action) => {
          finish(state)
          state.isMutating = false
          replaceItem(state, action.payload)
          state.error = null
        })
        .addCase(patchData.rejected, (state, action) => {
          finish(state)
          state.isMutating = false
          state.error = action.payload ?? action.error
        })

        // Delete Data
        .addCase(deleteData.pending, (state) => {
          start(state)
          state.isMutating = true
        })
        .addCase(deleteData.fulfilled, (state, action) => {
          finish(state)
          state.isMutating = false
          state.data = state.data.filter((item) => item.id !== action.payload)
          state.totalItems = Math.max(0, state.totalItems - 1)
          state.error = null
        })
        .addCase(deleteData.rejected, (state, action) => {
          finish(state)
          state.isMutating = false
          state.error = action.payload ?? action.error
        })
    },
  })

  return {
    reducer: slice.reducer,
    fetchAll,
    fetchSingle,
    postData,
    updateData,
    patchData,
    deleteData,
  }
}

/**
 * Layers extra action cases on top of a factory-built reducer, for domains whose
 * action-endpoint thunks (approve/refund/process/...) also need to write to state.
 *
 * This exists because a slice's own thunks must be declared BEFORE their cases are
 * registered, while the factory call comes first — so the cases cannot be passed into
 * `createSliceFactory` options. Wrap the exported reducer instead:
 *
 *   const { reducer, fetchAll } = createSliceFactory<Review>({ name: "reviews", endpoint })
 *   export default withExtraCases(reducer, (builder) => {
 *     builder.addCase(approveReview.fulfilled, (state, action) => { ... })
 *   })
 *
 * Cases run after the factory's own, so they can rely on the factory's state shape.
 */
export function withExtraCases<S>(
  base: Reducer<S>,
  buildCases: (builder: ActionReducerMapBuilder<S>) => void
): Reducer<S> {
  const extra = createReducer(undefined as unknown as S, (builder) => {
    buildCases(builder)
    return builder
  })

  // `createReducer` returns the identical state reference for non-matching actions, so this
  // composition is a no-op for every action the extra cases don't handle.
  return (state, action) => extra(base(state, action), action)
}
