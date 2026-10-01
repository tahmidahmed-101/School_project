import type { AuthUser } from "./types"

// DEV-ONLY auth bypass. Lets the app render the dashboard without logging in so
// the UI can be worked on when the backend is unreachable or credentials expire.
// This is inert unless import.meta.env.DEV is true, so it can never affect a
// production bundle. Never ship a build with VITE_DEV_AUTH_BYPASS=true.
export const DEV_AUTH_BYPASS =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS === "true"

export const DEV_USER: AuthUser = {
  id: "dev-user",
  email: "dev@local.test",
  first_name: "Dev",
  last_name: "User",
  role: "Administrator",
  phone: "",
  profile_picture: "",
  is_email_verified: true,
  is_phone_verified: true,
  permissions: ["*"],
}
