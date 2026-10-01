import { useAppSelector } from "@/app/hooks"
import { hasPermission } from "@/app/modules"

/** True when the signed-in user holds `code` (or any of `codes`). Admins (["*"]) always pass. */
export function usePermission(...codes: string[]): boolean {
  const permissions = useAppSelector((state) => state.auth.user?.permissions)
  return codes.some((code) => hasPermission(permissions, code))
}
