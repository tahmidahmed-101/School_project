import { Fragment, type ReactNode } from "react"
import { Link, useLocation } from "react-router-dom"
import { ChevronRight, Home } from "lucide-react"

import { findNavEntry } from "./navEntry"

interface Crumb {
  label: string
  to?: string
}

/**
 * Trail above the page title: home icon › section › list › current page. Built from the
 * sidebar navigation, so pages don't have to describe where they sit.
 */
export function Breadcrumbs({ title, backTo }: { title: ReactNode; backTo?: string }) {
  const { pathname } = useLocation()
  if (pathname === "/") return null

  const entry = findNavEntry(pathname, backTo)
  const current = typeof title === "string" ? title : undefined
  const onListPage = entry?.item.url === pathname

  const crumbs: Crumb[] = []
  if (entry) {
    // The dashboard's own section ("Home") would only repeat the first crumb.
    if (!entry.section.items.some((item) => item.url === "/")) crumbs.push({ label: entry.section.label })
    crumbs.push(onListPage ? { label: entry.item.title } : { label: entry.item.title, to: entry.item.url })
    if (!onListPage && current) crumbs.push({ label: current })
  } else if (current) {
    crumbs.push({ label: current })
  }

  return (
    <nav aria-label="Breadcrumb">
      {/* One line always: earlier crumbs keep their width and the current page truncates. */}
      <ol className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
        <li className="shrink-0">
          <Link
            to="/"
            aria-label="Dashboard"
            className="flex items-center text-primary transition-opacity hover:opacity-80"
          >
            <Home className="size-4" />
          </Link>
        </li>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <Fragment key={`${crumb.label}-${i}`}>
              <li aria-hidden className="flex shrink-0 items-center">
                <ChevronRight className="size-3.5" />
              </li>
              <li
                className={
                  isLast ? "min-w-0 truncate font-medium text-foreground" : "shrink-0 whitespace-nowrap"
                }
                aria-current={isLast ? "page" : undefined}
              >
                {crumb.to ? (
                  <Link to={crumb.to} className="transition-colors hover:text-foreground">
                    {crumb.label}
                  </Link>
                ) : (
                  crumb.label
                )}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
