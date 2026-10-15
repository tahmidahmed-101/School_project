import type { ComponentType, ReactNode } from "react"

/** One fact with an icon in place of its label; the label stays as hover text and for screen readers. */
export function IconLine({
  icon: Icon,
  label,
  children,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span title={label} className="mt-0.5 shrink-0 text-muted-foreground">
        <Icon className="size-4" />
        <span className="sr-only">{label}</span>
      </span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  )
}
