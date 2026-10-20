import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

/**
 * A switch inside a bordered box the height of a text input, with the current state written beside it
 * (green when on). Sits under a field label like any input; `SwitchField` wraps it for react-hook-form.
 */
export function SwitchBox({
  id,
  checked,
  onCheckedChange,
  disabled,
  onLabel = "Yes",
  offLabel = "No",
  className,
}: {
  id: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  onLabel?: string
  offLabel?: string
  className?: string
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex h-11 items-center justify-between gap-3 rounded-lg border border-field-border bg-field-bg px-4",
        disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
        className
      )}
    >
      <span
        className={cn(
          "text-sm font-medium",
          checked ? "text-green-700 dark:text-green-500" : "text-muted-foreground"
        )}
      >
        {checked ? onLabel : offLabel}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </label>
  )
}
