import { ApiError } from "@/lib/api/client";

type UiKey = "loginInvalid" | "forgotCodeInvalid" | "errTooMany" | "errNetwork" | "errServer" | "errGeneric";

/**
 * Message for a failed login/registration. Known failures get translated copy; a validation message from the API
 * (e.g. "A user with this email already exists.") is shown as it arrives because it names the actual problem.
 */
export function authErrorMessage(error: unknown, ui: (key: UiKey) => string): string {
  if (!(error instanceof ApiError)) return ui("errGeneric");
  if (error.isNetwork) return ui("errNetwork");
  if (error.code === "auth_invalid_credentials") return ui("loginInvalid");
  if (error.code === "invalid_otp") return ui("forgotCodeInvalid");
  if (error.status === 429) return ui("errTooMany");
  if (error.status >= 500) return ui("errServer");
  return Object.values(error.fields)[0] ?? error.message ?? ui("errGeneric");
}
