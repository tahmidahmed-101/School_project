import { useState } from "react"
import { toast } from "sonner"

import { Switch } from "@/components/ui/switch"
import { getApiErrorMessage } from "@/lib/api/client"

/**
 * A table switch that saves the moment it is flipped, and flips back if the save fails.
 * Give it a `key` that changes with the stored value, so a reloaded list resets it.
 */
export function SaveSwitch({
  label,
  checked: stored,
  disabled = false,
  save,
  failure,
}: {
  /** Read by screen readers, e.g. "Published: Blue shirt". */
  label: string
  checked: boolean
  disabled?: boolean
  save: (next: boolean) => Promise<unknown>
  /** Shown when the save fails and the server gives no message of its own. */
  failure: string
}) {
  const [checked, setChecked] = useState(stored)
  const [saving, setSaving] = useState(false)
  const toggle = async (next: boolean) => {
    setChecked(next)
    setSaving(true)
    try {
      await save(next)
    } catch (err) {
      setChecked(!next)
      toast.error(getApiErrorMessage(err, failure))
    } finally {
      setSaving(false)
    }
  }
  return <Switch aria-label={label} checked={checked} disabled={disabled || saving} onCheckedChange={toggle} />
}
