import { createAsyncThunk } from "@reduxjs/toolkit"
import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapEnvelope, unwrapItem } from "@/lib/api/envelope"
import type { AdminUser, PermissionCodeInfo } from "../types"

// /admin/staff/ (admin-only). List filters: search, include_deleted. DELETE is a soft delete.
const { reducer, fetchAll, fetchSingle, postData, patchData, deleteData } = createSliceFactory<AdminUser>({
  name: "staffs",
  endpoint: "/admin/staff/",
  initialSingleData: null,
})

export { fetchAll, fetchSingle, postData, patchData, deleteData }

/** PATCH /admin/staff/{id}/permissions/ — `permissions` fully replaces the current grant set. */
export const updateStaffPermissions = createAsyncThunk(
  "staffs/updatePermissions",
  async ({ id, permissions }: { id: string; permissions: string[] }, { rejectWithValue }) => {
    try {
      const res = await api.patch(`/admin/staff/${id}/permissions/`, { permissions })
      return unwrapItem<AdminUser>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const restoreStaff = createAsyncThunk("staffs/restore", async (id: string, { rejectWithValue }) => {
  try {
    const res = await api.post(`/admin/staff/${id}/restore/`)
    return unwrapItem<AdminUser>(res.data)
  } catch (err) {
    return rejectWithValue(extractApiError(err))
  }
})

/** GET /admin/staff/permission-codes/ — the backend's source of truth for the permission picker. */
export const fetchPermissionCodes = createAsyncThunk(
  "staffs/fetchPermissionCodes",
  async (_: void, { rejectWithValue }) => {
    try {
      const res = await api.get("/admin/staff/permission-codes/")
      return unwrapEnvelope<PermissionCodeInfo[]>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export default withExtraCases(reducer, (builder) => {
  for (const thunk of [updateStaffPermissions, restoreStaff]) {
    builder.addCase(thunk.fulfilled, (state, action) => {
      const user = action.payload
      state.data = state.data.map((u) => (u.id === user.id ? user : u))
      if (state.singleData && (state.singleData as AdminUser).id === user.id) {
        state.singleData = user
      }
    })
  }
})
