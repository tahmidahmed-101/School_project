import { useMemo } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import type { PermissionCodeInfo } from "@/features/users/types"

interface Props {
  codes: PermissionCodeInfo[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  disabled?: boolean
}

/** Checkbox grid of the backend's permission codes, grouped by domain. */
export function PermissionsEditor({ codes, selected, onChange, disabled }: Props) {
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; codes: PermissionCodeInfo[] }>()
    for (const code of codes) {
      const group = map.get(code.domain) ?? { label: code.domain_label, codes: [] }
      group.codes.push(code)
      map.set(code.domain, group)
    }
    return Array.from(map.entries())
  }, [codes])

  const toggle = (code: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(code)
    else next.delete(code)
    onChange(next)
  }

  const toggleGroup = (group: PermissionCodeInfo[], on: boolean) => {
    const next = new Set(selected)
    for (const c of group) {
      if (on) next.add(c.code)
      else next.delete(c.code)
    }
    onChange(next)
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map(([domain, group]) => {
        const all = group.codes.every((c) => selected.has(c.code))
        const some = !all && group.codes.some((c) => selected.has(c.code))
        return (
          <fieldset key={domain} className="rounded-lg border p-3" disabled={disabled}>
            <legend className="px-1 text-sm font-semibold">
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={all ? true : some ? "indeterminate" : false}
                  onCheckedChange={(checked) => toggleGroup(group.codes, checked === true)}
                  disabled={disabled}
                  aria-label={`All ${group.label} permissions`}
                />
                {group.label}
              </label>
            </legend>
            <div className="mt-1 space-y-1">
              {group.codes.map((code) => (
                <label
                  key={code.code}
                  className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 text-sm hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selected.has(code.code)}
                    onCheckedChange={(checked) => toggle(code.code, checked === true)}
                    disabled={disabled}
                  />
                  <span>{code.label}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">{code.code}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}
