import { Fragment, type ReactNode } from "react"
import { Link, useLocation } from "react-router-dom"
import { ChevronRight, Home } from "lucide-react"

import { featureModules } from "@/app/modules"

interface Crumb {
  label: string
  to?: string
}

const navEntries = () =>
  featureModules.flatMap((m) => m.nav).flatMap((section) => section.items.map((item) => ({ section, item })))

/** True when `path` is `url` or sits underneath it ("/bundles" matches "/bundles/42"). */
const isUnder = (path: string, url: string) => path === url || path.startsWith(`${url}/`)

/**
 * The sidebar entry a page belongs to. List pages match their own URL; detail and form
 * pages ("/product_detail/1", "/category_form/new") are mapped back to their list by name.
 */
function findNavEntry(pathname: string, backTo?: string) {
  const entries = navEntries()
  const byPrefix = (path: string) =>
    entries
      .filter(({ item }) => item.url !== "/" && isUnder(path, item.url))
      .sort((a, b) => b.item.url.length - a.item.url.length)[0]

  const direct = byPrefix(pathname)
  if (direct) return direct

  const stem = pathname.split("/")[1]?.replace(/_(detail|form)$/, "")
  if (stem) {
    const guesses = [`/${stem}s`, `/${stem.replace(/y$/, "ies")}`, `/${stem}`]
    const guessed = entries.find(({ item }) => guesses.includes(item.url))
    if (guessed) return guessed
  }

  return backTo ? byPrefix(backTo.split("?")[0]) : undefined
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
