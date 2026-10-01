import type { ReactNode } from "react"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { getStatusTone, type StatusTone } from "./status-tones"

export interface StatusBadgeProps extends Omit<BadgeProps, "variant"> {
  /** The raw status/enum value, e.g. "pending_payment" or "active". */
  status: string | null | undefined
  /** Override the tone the canonical map would otherwise resolve to. */
  tone?: StatusTone
  /** Override the default label (title-cased, underscores replaced with spaces). */
  label?: ReactNode
}

export function StatusBadge({ status, tone, label, className, ...props }: StatusBadgeProps) {
  const resolvedTone = tone ?? getStatusTone(status)
  return (
    <Badge variant={resolvedTone} className={cn("capitalize", className)} {...props}>
      {label ?? (status ? status.replace(/_/g, " ") : "—")}
    </Badge>
  )
}
