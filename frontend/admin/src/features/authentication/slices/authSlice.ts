import { createAsyncThunk, createSlice, createAction } from "@reduxjs/toolkit"
import { api, extractApiError, refreshAccessToken } from "@/lib/api/client"
import { setAccessToken, clearTokens, broadcastLogout } from "@/lib/api/tokenStore"
import { DEV_AUTH_BYPASS, DEV_USER } from "../devAuth"
import type { AuthUser, LoginPayload } from "../types"

// Not sliceFactory-backed: this is a session store, not a CRUD collection. Its state
// (user/isAuthenticated/bootstrapped) has no `data`/`singleData` concept, it owns extra
// reducers (logout, sessionExpired, devBypassLogin), and its thunks manage refresh tokens.

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  bootstrapped: boolean
  error: unknown
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  bootstrapped: false,
  error: null,
}

interface LoginResponseData {
  access: string
  user: AuthUser
}

export const login = createAsyncThunk(
  "auth/login",
  async (payload: LoginPayload, { rejectWithValue }) => {
    try {
      // The backend sets the refresh token as an HttpOnly cookie on this response.
      const res = await api.post("/customer/auth/login/", payload)
      const data = res.data.data as LoginResponseData
      setAccessToken(data.access)
      return data.user
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const logout = createAsyncThunk("auth/logout", async () => {
  try {
    // Blacklists the refresh token and clears the cookie server-side.
    await api.post("/customer/auth/logout/")
  } catch {
    // best-effort — clear the local session regardless of server response
  } finally {
    clearTokens()
    broadcastLogout()
  }
})

export const fetchMe = createAsyncThunk("auth/fetchMe", async (_: void, { rejectWithValue }) => {
  try {
    const res = await api.get("/customer/auth/me/")
    return res.data.data as AuthUser
  } catch (err) {
    return rejectWithValue(extractApiError(err))
  }
})

// Silently restores a session on app boot: the refresh cookie (if any) is sent
// automatically, so there's nothing to check client-side before trying.
export const bootstrapAuth = createAsyncThunk(
  "auth/bootstrap",
  async (_: void, { dispatch, rejectWithValue }) => {
    try {
      await refreshAccessToken()
      return await dispatch(fetchMe()).unwrap()
    } catch (err) {
      clearTokens()
      return rejectWithValue(extractApiError(err))
    }
  }
)

// Dispatched by main.tsx when the axios client (src/lib/api/client.ts) gives up
// refreshing a session, so Redux state stays in sync without client.ts importing the store.
export const sessionExpired = createAction("auth/sessionExpired")

export type ProfilePatch = Partial<Pick<AuthUser, "first_name" | "last_name" | "phone" | "profile_picture">>

export const updateProfile = createAsyncThunk(
  "auth/updateProfile",
  async (patch: ProfilePatch, { rejectWithValue }) => {
    try {
      const res = await api.patch("/customer/profile/", patch)
      return res.data.data as Partial<AuthUser>
    } catch (err) {
      // Surface the failure; merging locally would tell the user it saved when it didn't.
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const changePassword = createAsyncThunk(
  "auth/changePassword",
  async (payload: { old_password: string; new_password: string }, { rejectWithValue }) => {
    try {
      await api.post("/customer/profile/change-password/", payload)
      return true
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    patchUser(state, action: { payload: Partial<AuthUser> }) {
      if (state.user) {
        state.user = { ...state.user, ...action.payload }
      }
    },
    // Marks the session authenticated without a backend round-trip. Only ever
    // dispatched when DEV_AUTH_BYPASS is on.
    devBypassLogin(state) {
      // Guard here too, so a hand-dispatched action (e.g. via DevTools) is a no-op in prod.
      if (!DEV_AUTH_BYPASS) return
      state.user = DEV_USER
      state.isAuthenticated = true
      state.bootstrapped = true
      state.isLoading = false
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.isLoading = false
        state.user = action.payload
        state.isAuthenticated = true
        state.bootstrapped = true
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload ?? action.error
        state.isAuthenticated = false
      })

      .addCase(logout.fulfilled, (state) => {
        state.user = null
        state.isAuthenticated = false
      })

      .addCase(fetchMe.fulfilled, (state, action) => {
        state.user = action.payload
        state.isAuthenticated = true
      })

      .addCase(bootstrapAuth.fulfilled, (state, action) => {
        state.user = action.payload
        state.isAuthenticated = true
        state.bootstrapped = true
      })
      .addCase(bootstrapAuth.rejected, (state) => {
        state.user = null
        state.isAuthenticated = false
        state.bootstrapped = true
      })

      .addCase(sessionExpired, (state) => {
        // With the dev bypass there is no real token, so every API call 401s.
        // Staying signed in keeps the shell usable even though data won't load.
        if (DEV_AUTH_BYPASS) return
        state.user = null
        state.isAuthenticated = false
      })

      .addCase(updateProfile.fulfilled, (state, action) => {
        if (state.user && action.payload) {
          state.user = { ...state.user, ...action.payload }
        }
      })
  },
})

export const { patchUser, devBypassLogin } = authSlice.actions
export default authSlice.reducer
