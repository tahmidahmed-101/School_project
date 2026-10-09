import { apiRequest } from "@/lib/api/client";
import type { ApiAuthUser } from "@/lib/api/types";

/**
 * Customer account endpoints (/api/v1/customer/auth). Browser only: the refresh token lives in an HttpOnly cookie
 * the backend sets, so this code only ever holds the short-lived access token.
 */
const customer = { scope: "customer" as const };

/** POST /auth/login/ — sets the refresh cookie and returns an access token plus the account. */
export const login = (email: string, password: string) =>
  apiRequest<{ access: string; user: ApiAuthUser }>("/auth/login/", {
    ...customer,
    method: "POST",
    body: { email, password, remember_me: true },
  });

export interface RegisterInput {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone: string;
}

/** POST /auth/register/ — creates the account; it does not log in. */
export const register = (input: RegisterInput) =>
  apiRequest<ApiAuthUser>("/auth/register/", { ...customer, method: "POST", body: input });

/** Answers the same whether or not the email has an account. */
export const forgotPassword = (email: string) =>
  apiRequest<void>("/auth/forgot-password/", { ...customer, method: "POST", body: { email } });

export const resetPassword = (input: { email: string; code: string; new_password: string }) =>
  apiRequest<void>("/auth/reset-password/", { ...customer, method: "POST", body: input });

/** POST /auth/refresh/ — trades the refresh cookie for a new access token (401 when there is no session). */
export const refresh = () => apiRequest<{ access: string }>("/auth/refresh/", { ...customer, method: "POST" });

/** GET /auth/me/ */
export const me = (access: string) =>
  apiRequest<ApiAuthUser>("/auth/me/", { ...customer, headers: { Authorization: `Bearer ${access}` } });

/** POST /auth/logout/ — revokes the refresh cookie. */
export const logout = () => apiRequest<void>("/auth/logout/", { ...customer, method: "POST" });
