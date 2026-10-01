import React, { useState, useSyncExternalStore } from "react"
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

interface FilterItem {
  component: React.ReactNode
  /** Marks the filter as set, so a collapsed "Filters" button can show a count. */
  active?: boolean
  /** Gives the control a wider inline slot (e.g. a search-as-you-type picker). */
  wide?: boolean
}

interface FilterToolbarProps {
  searchPlaceholder?: string
  searchValue?: string
  /** Omit to hide the search box (for endpoints without text search). */
  onSearchChange?: (value: string) => void
  filters?: FilterItem[]
  datePicker?: React.ReactNode
  /**
   * How many controls (date picker first, then filters) stay on the toolbar row on wide
   * screens. The rest live in a "More filters" panel, so the row never wraps.
   */
  inlineCount?: number
}

const SEARCH_INPUT_CLASS =
  "h-11 w-full rounded-lg border border-gray-300 bg-white pl-11 pr-4 text-sm text-gray-900 transition-all placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary dark:border-gray-800 dark:bg-white/5 dark:text-white/90 dark:placeholder:text-gray-500 dark:focus:bg-gray-700"

const TOGGLE_CLASS =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-gray-800"

/** Tailwind `sm` / `lg` breakpoints, evaluated in JS so each control renders exactly once. */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}

/**
 * Animated open/close: grid rows go 0fr -> 1fr so the panel eases to its natural height.
 * The content stays mounted (needed for the transition) but is inert while closed, so
 * hidden controls can't be focused or read out.
 */
const Collapse = ({ open, children }: { open: boolean; children: React.ReactNode }) => (
  <div
    inert={!open}
    aria-hidden={!open}
    className={cn(
      "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
      open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
    )}
  >
    <div className="min-h-0 overflow-hidden">{children}</div>
  </div>
)

type Control = FilterItem & { key: string; auto?: boolean }

const FilterToolbar = ({
  searchPlaceholder = "Search...",
  searchValue,
  onSearchChange,
  filters = [],
  datePicker,
  inlineCount = 2,
}: FilterToolbarProps) => {
  const [panelOpen, setPanelOpen] = useState(false)
  const isDesktop = useMediaQuery("(min-width: 640px)")
  const isWide = useMediaQuery("(min-width: 1024px)")
  // Some endpoints have no text search; the toolbar then holds only the filters.
  const hasSearch = Boolean(onSearchChange)

  // The date picker is treated as the first control so it gets an inline slot first.
  const controls: Control[] = [
    ...(datePicker ? [{ key: "date", component: datePicker, auto: true }] : []),
    ...filters.map((f, i) => ({ ...f, key: `filter-${i}` })),
  ]
  // Wide screens show the first few controls inline; everything else goes in the panel.
  const inline = isWide ? controls.slice(0, inlineCount) : []
  const panel = isWide ? controls.slice(inlineCount) : controls
  const activeInPanel = panel.filter((c) => c.active).length

  const toggleLabel = inline.length > 0 ? "More filters" : "Filters"

  const searchInput = (
    <div className="relative w-full">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
      <input
        type="text"
        aria-label={searchPlaceholder}
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={(e) => onSearchChange?.(e.target.value)}
        className={SEARCH_INPUT_CLASS}
      />
    </div>
  )

  const toggle = panel.length > 0 && (
    <button
      type="button"
      onClick={() => setPanelOpen((v) => !v)}
      aria-expanded={panelOpen}
      className={cn(TOGGLE_CLASS, isDesktop && !inline.length && "ml-auto")}
    >
      <SlidersHorizontal className="size-4 text-muted-foreground" />
      {toggleLabel}
      {activeInPanel > 0 && (
        <span className="rounded-full bg-primary-500/15 px-1.5 text-xs font-semibold text-primary-500">
          {activeInPanel}
        </span>
      )}
      <ChevronDown
        className={cn("size-4 text-muted-foreground transition-transform duration-300", panelOpen && "rotate-180")}
      />
    </button>
  )

  const panelContent = panel.length > 0 && (
    <Collapse open={panelOpen}>
      {isDesktop ? (
        <div className="pt-3">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-background/60 p-3 md:grid-cols-3 xl:grid-cols-4">
            {panel.map((c) => (
              <div key={c.key} className={cn("min-w-0", (c.auto || c.wide) && "col-span-2 md:col-span-1")}>
                {c.component}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 pt-3">
          {panel.map((c) => (
            <div key={c.key}>{c.component}</div>
          ))}
        </div>
      )}
    </Collapse>
  )

  if (!isDesktop) {
    return (
      <div className="mt-4 pt-4">
        <div className="flex flex-col gap-3">
          {hasSearch && searchInput}
          {toggle}
        </div>
        {panelContent}
      </div>
    )
  }

  return (
    <div className="mt-4 pt-4">
      {/* Always a single row; overflow lives in the animated panel below. */}
      <div className="flex items-center gap-3">
        {hasSearch && <div className="min-w-0 flex-1 lg:max-w-[380px]">{searchInput}</div>}

        {inline.length > 0 && (
          <div className={cn("flex shrink-0 items-center gap-3", hasSearch && "ml-auto")}>
            {inline.map((c) => (
              <div key={c.key} className={cn("shrink-0", c.auto ? "w-auto" : c.wide ? "w-64" : "w-44")}>
                {c.component}
              </div>
            ))}
          </div>
        )}

        {toggle}
      </div>

      {panelContent}
    </div>
  )
}

export default FilterToolbar
