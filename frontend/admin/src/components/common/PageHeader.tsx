import type { ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Breadcrumbs } from "./Breadcrumbs"
import { PageHeading } from "./PageHeading"

export interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** Buttons on the right (export, import, create…). One line from `lg` up; two per row on phones. */
  actions?: ReactNode
  /** Icon-only back button before the title, for detail and form pages. */
  back?: { to: string; label: string }
  /** Shown next to the title, e.g. a status badge. */
  badges?: ReactNode
  className?: string
}

/**
 * The top of every page: a breadcrumb trail, then title + description on the left and actions
 * on the right. Below `lg` the actions wrap under the title, where a full row is available.
 */
export function PageHeader({ title, description, actions, back, badges, className }: PageHeaderProps) {
  const navigate = useNavigate()
  const heading = badges ? (
    <span className="flex flex-wrap items-center gap-3">
      {title}
      {badges}
    </span>
  ) : (
    title
  )

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Breadcrumbs title={title} backTo={back?.to} />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {back && (
            <Button
              variant="back"
              size="icon"
              className="mt-1 shrink-0"
              onClick={() => navigate(back.to)}
              aria-label={back.label}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <PageHeading title={heading} description={description} className="min-w-0" />
        </div>
        {actions && (
          // Phones: two buttons per row, and a button left alone on its row (a single action, or
          // the last of an odd number) takes the full width.
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center lg:shrink-0 lg:justify-end [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
