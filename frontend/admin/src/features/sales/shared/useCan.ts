import { useAppSelector } from "@/app/hooks"
import { hasPermission } from "@/app/modules"

/** True when the signed-in staff user holds any of `permissions` (admins hold "*"). */
export function useCan(...permissions: string[]): boolean {
  const granted = useAppSelector((state) => state.auth.user?.permissions)
  return permissions.some((p) => hasPermission(granted, p))
}
