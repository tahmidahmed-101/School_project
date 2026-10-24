import { useMemo } from "react"
import { useAppSelector } from "@/app/hooks"

/**
 * Keys of the modules switched off in Settings → Modules, or left out of the plan. Empty until the list has
 * loaded, so nothing is hidden on a guess; the backend refuses a switched-off module's requests either way.
 */
export function useOffModules(): string[] {
  const modules = useAppSelector((state) => state.businessSettings.modules.data)
  return useMemo(() => modules.filter((m) => !m.is_licensed || !m.is_enabled).map((m) => m.key), [modules])
}

/** True once the module list has loaded or failed to: until then a module's page and requests wait. */
export function useModulesKnown(): boolean {
  // A refetch (after a switch in Settings) keeps the list it already has, so nothing blanks while it runs.
  return useAppSelector(({ businessSettings: { modules } }) => modules.data.length > 0 || modules.status === "failed")
}

/** A module's name as Settings shows it ("Reports & analytics"), or its key before the list has loaded. */
export function useModuleLabel(key: string): string {
  return useAppSelector((state) => state.businessSettings.modules.data.find((m) => m.key === key)?.label ?? key)
}
