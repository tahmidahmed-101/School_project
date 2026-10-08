import { createAsyncThunk } from "@reduxjs/toolkit"
import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapEnvelope, unwrapItem } from "@/lib/api/envelope"
import type { Kind } from "@/hooks/use-kind"
import type { AdminAddress, AdminUser } from "../types"

// /admin/users/ (admin-only). List filters: role, is_active, search, include_deleted.
// Callers pass role: "customer" — the endpoint lists every account otherwise.
const { reducer, fetchAll, fetchSingle, postData, patchData } = createSliceFactory<AdminUser>({
  name: "customers",
  endpoint: "/admin/users/",
  initialSingleData: null,
})

// postData (POST /admin/users/) backs the customer CSV import; callers send role: "customer".
export { fetchAll, fetchSingle, postData, patchData }

const userAction = (name: string, path: string) =>
  createAsyncThunk(`customers/${name}`, async (id: string, { rejectWithValue }) => {
    try {
      const res = await api.post(`/admin/users/${id}/${path}/`)
      return unwrapItem<AdminUser>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  })

export const activateUser = userAction("activate", "activate")
export const deactivateUser = userAction("deactivate", "deactivate")
export const softDeleteUser = userAction("softDelete", "soft-delete")
export const restoreUser = userAction("restore", "restore")

export const bulkDeactivateUsers = createAsyncThunk(
  "customers/bulkDeactivate",
  async (ids: string[], { rejectWithValue }) => {
    try {
      const res = await api.post("/admin/users/bulk-deactivate/", { ids })
      return unwrapItem<{ affected: number }>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const resetUserPassword = createAsyncThunk(
  "customers/resetPassword",
  async ({ id, new_password }: { id: string; new_password: string }, { rejectWithValue }) => {
    try {
      await api.post(`/admin/users/${id}/reset-password/`, { new_password })
      return id
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

/** GET /admin/users/{id}/?kind= — the customer's order figures on one half. Held in local state. */
export const fetchOrderSummary = createAsyncThunk(
  "customers/fetchOrderSummary",
  async ({ id, kind }: { id: string; kind: Kind }, { rejectWithValue, signal }) => {
    try {
      const res = await api.get(`/admin/users/${id}/`, { params: { kind }, signal })
      return unwrapItem<AdminUser>(res.data).order_summary ?? null
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

/** Not kept in Redux — the detail page holds the result in local state. */
export const fetchUserAddresses = createAsyncThunk(
  "customers/fetchAddresses",
  async (id: string, { rejectWithValue }) => {
    try {
      const res = await api.get(`/admin/users/${id}/addresses/`)
      return unwrapEnvelope<AdminAddress[]>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

/** POST /admin/users/{id}/set-role/ — e.g. promote a customer to staff. */
export const setUserRole = createAsyncThunk(
  "customers/setRole",
  async ({ id, role }: { id: string; role: AdminUser["role"] }, { rejectWithValue }) => {
    try {
      const res = await api.post(`/admin/users/${id}/set-role/`, { role })
      return unwrapItem<AdminUser>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

/** POST /admin/users/{id}/addresses/ */
export const addUserAddress = createAsyncThunk(
  "customers/addAddress",
  async ({ id, payload }: { id: string; payload: Partial<AdminAddress> }, { rejectWithValue }) => {
    try {
      const res = await api.post(`/admin/users/${id}/addresses/`, payload)
      return unwrapItem<AdminAddress>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

const actionThunks = [activateUser, deactivateUser, softDeleteUser, restoreUser, setUserRole]

export default withExtraCases(reducer, (builder) => {
  for (const thunk of actionThunks) {
    builder.addCase(thunk.fulfilled, (state, action) => {
      const user = action.payload
      state.data = state.data.map((u) => (u.id === user.id ? user : u))
      if (state.singleData && (state.singleData as AdminUser).id === user.id) {
        // Keep the detail-only order_summary, which action responses don't carry.
        state.singleData = { ...(state.singleData as AdminUser), ...user }
      }
    })
  }
})
