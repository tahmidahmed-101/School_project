import { useAppSelector } from "@/app/hooks"
import { hasPermission } from "@/app/modules"

/** The signed-in user's permission codes (admins hold ["*"]). */
export function usePermissions(): string[] | undefined {
  return useAppSelector((state) => state.auth.user?.permissions)
}

/** True when the signed-in user holds any of the given StaffPermission codes. No codes → false. */
export function useCan(...codes: string[]): boolean {
  const permissions = usePermissions()
  return codes.some((code) => hasPermission(permissions, code))
}

/** Admins and superusers carry the "*" wildcard instead of individual codes. */
export const isFullAccess = (permissions: string[] | null | undefined) => !!permissions?.includes("*")
