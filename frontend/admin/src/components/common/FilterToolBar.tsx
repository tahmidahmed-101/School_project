import React, { useState, useSyncExternalStore, isValidElement } from "react"
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SortSelect } from "./SortSelect"

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
  "h-10 w-full rounded-lg border border-field-border bg-transparent pl-11 pr-4 text-sm text-field-text transition-all placeholder:text-field-placeholder focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"

const TOGGLE_CLASS =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-field-border bg-transparent px-4 text-sm font-medium text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5"

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
  // Layout is search on the left, dropdowns on the right. Without a text search, a leading
  // search-as-you-type picker (e.g. a variant picker) takes the search slot.
  const lead = !hasSearch && inline[0]?.wide ? inline[0] : null
  const rest = lead ? inline.slice(1) : inline

  const toggleLabel = inline.length > 0 ? "More filters" : "Filters"

  // Filters in effect, as removable chips. They are read off the dropdown elements the page
  // passed in (their `placeholder`, selected option and change handler), so a filter tucked
  // away under "More filters" is still visible, and pages don't have to describe it twice.
  const chips = controls.flatMap((c) => {
    if (!isValidElement(c.component) || c.component.type === SortSelect) return []
    const props = c.component.props as {
      value?: { label?: unknown } | null
      placeholder?: string
      onValueChange?: (value: null) => void
    }
    const label = props.value && typeof props.value === "object" ? props.value.label : undefined
    const clear = props.onValueChange
    if (typeof label !== "string" || !clear) return []
    return [{ key: c.key, label: props.placeholder ? `${props.placeholder}: ${label}` : label, clear: () => clear(null) }]
  })
  const chipRow = chips.length > 0 && (
    <div className="flex flex-wrap items-center gap-2 pt-3">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-1 pl-3 pr-1 text-xs font-medium"
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.clear}
            aria-label={`Remove filter ${chip.label}`}
            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={() => chips.forEach((chip) => chip.clear())}
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          Clear all
        </button>
      )}
    </div>
  )

  const searchInput = (
    <div className="relative w-full">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
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
      className={cn(TOGGLE_CLASS, isDesktop && !rest.length && "ml-auto")}
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
        {chipRow}
      </div>
    )
  }

  return (
    <div className="mt-4 pt-4">
      {/* Always a single row; overflow lives in the animated panel below. */}
      <div className="flex items-center gap-3">
        {(hasSearch || lead) && (
          <div className="min-w-0 flex-1 lg:max-w-[380px]">{hasSearch ? searchInput : lead?.component}</div>
        )}

        {rest.length > 0 && (
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {rest.map((c) => (
              <div key={c.key} className={cn("shrink-0", c.auto ? "w-auto" : c.wide ? "w-64" : "w-44")}>
                {c.component}
              </div>
            ))}
          </div>
        )}

        {toggle}
      </div>

      {panelContent}
      {chipRow}
    </div>
  )
}

export default FilterToolbar
