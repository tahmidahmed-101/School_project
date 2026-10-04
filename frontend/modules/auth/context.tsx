"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, apiRequest, type RequestOptions } from "@/lib/api/client";
import type { ApiAuthUser } from "@/lib/api/types";
import * as authApi from "./data/api";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  /** "" when there is none. */
  profilePicture: string;
  /** Only "customer" accounts may ask questions or report prices; staff accounts get a 403 from the API. */
  role: string;
}

interface AuthContextType {
  /** "loading" until the saved session (if any) has been restored. */
  status: "loading" | "guest" | "authenticated";
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: authApi.RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  /** A customer-API request as the logged-in customer. Renews an expired access token once, then gives up. */
  authRequest: <T>(path: string, options?: Omit<RequestOptions, "scope">) => Promise<T>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** Set while a refresh cookie may exist, so guests never pay for a refresh request that can only fail. */
const SESSION_HINT = "kullmart:session";

function toUser(api: ApiAuthUser): AuthUser {
  return {
    id: api.id,
    email: api.email,
    name: `${api.first_name} ${api.last_name}`.trim(),
    phone: api.phone,
    profilePicture: api.profile_picture ?? "",
    role: api.role,
  };
}

function hasSessionHint(): boolean {
  try {
    return window.localStorage.getItem(SESSION_HINT) === "1";
  } catch {
    return false;
  }
}

function setSessionHint(on: boolean) {
  try {
    if (on) window.localStorage.setItem(SESSION_HINT, "1");
    else window.localStorage.removeItem(SESSION_HINT);
  } catch {
    // Storage blocked (private mode): the session still works for this page view.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthContextType["status"]>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  // The access token stays in memory only; the refresh token is an HttpOnly cookie this code cannot read.
  const accessRef = useRef<string | null>(null);
  const refreshingRef = useRef<Promise<string> | null>(null);

  const clearSession = useCallback(() => {
    accessRef.current = null;
    setSessionHint(false);
    setUser(null);
    setStatus("guest");
  }, []);

  /** One refresh at a time: parallel callers share the same request (the backend rotates the cookie). */
  const renewAccess = useCallback((): Promise<string> => {
    refreshingRef.current ??= authApi
      .refresh()
      .then(({ access }) => {
        accessRef.current = access;
        return access;
      })
      .finally(() => {
        refreshingRef.current = null;
      });
    return refreshingRef.current;
  }, []);

  useEffect(() => {
    if (!hasSessionHint()) {
      setStatus("guest");
      return;
    }
    let cancelled = false;
    renewAccess()
      .then((access) => authApi.me(access))
      .then((account) => {
        if (cancelled) return;
        setUser(toUser(account));
        setStatus("authenticated");
      })
      .catch((error) => {
        if (cancelled) return;
        // Offline is not "logged out": keep the hint so the next visit tries again.
        if (error instanceof ApiError && error.isNetwork) setStatus("guest");
        else clearSession();
      });
    return () => {
      cancelled = true;
    };
  }, [renewAccess, clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    const { access, user: account } = await authApi.login(email, password);
    accessRef.current = access;
    setSessionHint(true);
    setUser(toUser(account));
    setStatus("authenticated");
  }, []);

  const register = useCallback(
    async (input: authApi.RegisterInput) => {
      await authApi.register(input);
      await login(input.email, input.password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // The cookie could not be revoked (offline); the local session is dropped regardless.
    }
    clearSession();
  }, [clearSession]);

  const authRequest = useCallback(
    async <T,>(path: string, options: Omit<RequestOptions, "scope"> = {}): Promise<T> => {
      const send = (access: string) =>
        apiRequest<T>(path, {
          ...options,
          scope: "customer",
          headers: { ...options.headers, Authorization: `Bearer ${access}` },
        });
      try {
        return await send(accessRef.current ?? (await renewAccess()));
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
      }
      // Access token expired (or the refresh above failed): renew once and retry.
      try {
        return await send(await renewAccess());
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) clearSession();
        throw error;
      }
    },
    [renewAccess, clearSession],
  );

  const value = useMemo(
    () => ({ status, user, login, register, logout, authRequest }),
    [status, user, login, register, logout, authRequest],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}
