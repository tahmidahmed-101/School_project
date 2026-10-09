import { Children, Fragment, cloneElement, isValidElement, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, ChevronDown, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/use-media-query"
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
    <div className={cn("flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between", className)}>
      {/* Left: breadcrumb and title together. Right: the page's buttons, centred against them. */}
      <div className="flex min-w-0 flex-col gap-2">
        <Breadcrumbs title={title} backTo={back?.to} />
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
      </div>
      {actions && <HeaderActions>{actions}</HeaderActions>}
    </div>
  )
}

/** Top-level action elements, with fragments (`<>…</>`) opened up and empty slots dropped. */
function flattenActions(node: ReactNode): ReactNode[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
      ? flattenActions(child.props.children)
      : [child]
  )
}

/**
 * The header's buttons. From `sm` up they sit in a row. On phones the main action (the last
 * one) takes the width and the rest fold behind a "More" toggle, so a page with three or four
 * actions doesn't push its content down the screen. Folded buttons stay mounted, so a dialog
 * one of them opened keeps its state.
 */
function HeaderActions({ children }: { children: ReactNode }) {
  const isPhone = useMediaQuery("(max-width: 639px)")
  const [open, setOpen] = useState(false)
  // Nested fragments repeat React's own child keys (".0"), so each flattened action gets its position as key.
  const items = flattenActions(children).map((item, index) =>
    isValidElement(item) ? cloneElement(item, { key: index }) : item
  )
  if (items.length === 0) return null

  if (!isPhone || items.length < 3) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center lg:shrink-0 lg:justify-end [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
        {items}
      </div>
    )
  }

  const primary = items[items.length - 1]
  const others = items.slice(0, -1)
  return (
    <div className="flex flex-col">
      <div className="flex gap-3 [&>*:first-child]:flex-1">
        {primary}
        <Button
          type="button"
          variant="outline"
          size="action"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <MoreHorizontal className="size-4" /> More
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </Button>
      </div>
      {/* Animating the grid row from 0fr to 1fr slides the folded buttons open at their natural height. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
        inert={!open}
      >
        <div className="overflow-hidden">
          <div className="grid grid-cols-2 gap-3 pt-3 [&>*:last-child:nth-child(odd)]:col-span-2">{others}</div>
        </div>
      </div>
    </div>
  )
}
