import { useCallback } from "react"
import { useAppSelector } from "@/app/hooks"
import { hasPermission } from "@/app/modules"

/**
 * Backend views guarded by `IsAdmin` (users, staff, audit) accept only admins/superusers,
 * whose permission list is ["*"] — no staff permission code unlocks them. Nav items and
 * actions for those endpoints use this code so `hasPermission` only passes for admins.
 */
export const ADMIN_ONLY = "*"

/** Returns a checker bound to the signed-in user's permission list. */
export function useCan() {
  const permissions = useAppSelector((state) => state.auth.user?.permissions)
  return useCallback((code?: string) => hasPermission(permissions, code), [permissions])
}
