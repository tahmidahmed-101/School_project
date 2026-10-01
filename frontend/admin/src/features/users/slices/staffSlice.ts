import { createAsyncThunk } from "@reduxjs/toolkit"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapEnvelope } from "@/lib/api/envelope"
import {
  createActionThunk,
  createApiThunk,
  createSliceFactory,
  replaceOnFulfilled,
  withExtraCases,
} from "@/lib/sliceFactory"
import type { AdminUser, PermissionCodeInfo } from "../types"

// /admin/staff/ (admin-only). List filters: search, include_deleted. DELETE is a soft delete.
const { reducer, fetchAll, fetchSingle, postData, patchData, deleteData } = createSliceFactory<AdminUser>({
  name: "staffs",
  endpoint: "/admin/staff/",
  initialSingleData: null,
})

export { fetchAll, fetchSingle, postData, patchData, deleteData }

/** PATCH /admin/staff/{id}/permissions/ — `permissions` fully replaces the current grant set. */
export const updateStaffPermissions = createApiThunk<{ id: string; permissions: string[] }, AdminUser>(
  "staffs/updatePermissions",
  ({ id, permissions }) => api.patch(`/admin/staff/${id}/permissions/`, { permissions })
)

export const restoreStaff = createActionThunk<AdminUser>("staffs/restore", "/admin/staff/", "restore")

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
  replaceOnFulfilled(builder, updateStaffPermissions, restoreStaff)
})
