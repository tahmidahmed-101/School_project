// Single source of truth for the access token, kept outside Redux so the axios client
// (client.ts) never needs to import the store/authSlice and risk a circular import.
//
// The access token lives only in memory. The refresh token is an HttpOnly cookie set by
// the backend, so JavaScript can neither read nor steal it; a session is restored on
// reload by calling /auth/refresh/ and letting the browser send the cookie.

/** localStorage key used only to broadcast logout to other open tabs. */
export const LOGOUT_BROADCAST_KEY = "auth:logout"

let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function clearTokens(): void {
  accessToken = null
}

/** Tells other tabs this session ended (they listen for the `storage` event). */
export function broadcastLogout(): void {
  try {
    localStorage.setItem(LOGOUT_BROADCAST_KEY, String(Date.now()))
  } catch {
    // storage unavailable (private mode); other tabs will notice on their next 401
  }
}
