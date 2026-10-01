import { useState } from "react"
import { toast } from "sonner"
import { Lock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchModules, updateModule } from "@/features/system/slices/businessSettingsSlice"
import type { BusinessModule } from "@/features/system/types"
import { getApiErrorMessage } from "@/lib/api/client"
import { SectionState } from "./SectionState"

export function ModulesPanel({ canManage }: { canManage: boolean }) {
  const dispatch = useAppDispatch()
  const { data, status, error } = useAppSelector((state) => state.businessSettings.modules)
  const [saving, setSaving] = useState<string | null>(null)

  // Unlicensed modules aren't part of the plan; the backend 404s on them, so don't show them.
  const modules = data.filter((m) => m.is_licensed)
  const labelOf = (key: string) => data.find((m) => m.key === key)?.label ?? key

  if (!modules.length) {
    return (
      <SectionState
        status={status}
        error={error}
        hasData={status === "succeeded"}
        onRetry={() => dispatch(fetchModules())}
        label="modules"
      />
    )
  }

  const save = async (module: BusinessModule, payload: { is_enabled: boolean } | { config: Record<string, boolean> }, success: string) => {
    const savingKey = "config" in payload ? `${module.key}:${Object.keys(payload.config)[0]}` : module.key
    setSaving(savingKey)
    try {
      await dispatch(updateModule({ key: module.key, payload })).unwrap()
      toast.success(success)
      // Toggling one module can change what its dependents may do.
      if ("is_enabled" in payload) dispatch(fetchModules())
    } catch (err) {
      toast.error(getApiErrorMessage(err, `Couldn't update ${module.label}`))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {modules.map((module) => {
        const lockedOn = module.is_enabled && !module.can_disable
        const blockedOff = !module.is_enabled && module.missing_dependencies.length > 0
        return (
          <Card key={module.key} className={module.is_enabled ? undefined : "opacity-90"}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  {module.label}
                  {lockedOn && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Always on" />}
                </CardTitle>
                <CardDescription>{module.description}</CardDescription>
              </div>
              <Switch
                aria-label={`${module.is_enabled ? "Disable" : "Enable"} ${module.label}`}
                checked={module.is_enabled}
                disabled={!canManage || lockedOn || blockedOff || saving === module.key}
                onCheckedChange={(checked) =>
                  save(module, { is_enabled: checked }, `${module.label} ${checked ? "enabled" : "disabled"}`)
                }
              />
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {lockedOn && module.locked_reason && (
                <p className="text-xs text-muted-foreground">{module.locked_reason}</p>
              )}
              {blockedOff && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  Turn on {module.missing_dependencies.map(labelOf).join(", ")} first.
                </p>
              )}
              {module.depends_on.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Needs</span>
                  {module.depends_on.map((key) => (
                    <Badge key={key} variant="outline" className="text-xs">
                      {labelOf(key)}
                    </Badge>
                  ))}
                </div>
              )}
              {module.config_fields.length > 0 && (
                <div className="rounded-lg border">
                  {module.config_fields.map((field, index) => (
                    <div key={field.key}>
                      {index > 0 && <Separator />}
                      <div className="flex items-start justify-between gap-4 p-3">
                        <div>
                          <label htmlFor={`cfg-${module.key}-${field.key}`} className="text-sm font-medium">
                            {field.label}
                          </label>
                          <p className="text-xs text-muted-foreground">{field.description}</p>
                        </div>
                        <Switch
                          id={`cfg-${module.key}-${field.key}`}
                          checked={field.value}
                          disabled={!canManage || !module.is_enabled || saving === `${module.key}:${field.key}`}
                          onCheckedChange={(checked) =>
                            save(
                              module,
                              { config: { [field.key]: checked } },
                              `${field.label} ${checked ? "enabled" : "disabled"}`
                            )
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
