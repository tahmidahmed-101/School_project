import React, { useState, useEffect, useId, useRef, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useAppSelector } from "@/app/hooks"
import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { Search, CornerDownLeft, X, Loader2 } from "lucide-react"
import {
  useNavDestinations,
  useRecordSearch,
  type SearchDestination,
} from "./globalSearchSources"

export type { SearchDestination }

export interface GlobalSearchProps {
  mobileOpen?: boolean
  onMobileOpenChange?: (open: boolean) => void
}

type SearchVariant = "inline" | "sheet"

const optionDomId = (listboxId: string, optionId: string) =>
  `${listboxId}-option-${optionId}`

interface SearchFieldProps {
  variant: SearchVariant
  inputId: string
  listboxId: string
  inputRef: React.Ref<HTMLInputElement>
  query: string
  expanded: boolean
  activeDescendantId?: string
  onQueryChange: (value: string) => void
  onFocus: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  onClear: () => void
}

const SearchField = ({
  variant,
  inputId,
  listboxId,
  inputRef,
  query,
  expanded,
  activeDescendantId,
  onQueryChange,
  onFocus,
  onKeyDown,
  onClear,
}: SearchFieldProps) => {
  return (
    <div className="relative flex items-center w-full">
      <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-gray-500 pointer-events-none" />

      <label htmlFor={inputId} className="sr-only">
        Search
      </label>

      <input
        id={inputId}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={expanded ? listboxId : undefined}
        aria-activedescendant={activeDescendantId}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onFocus={onFocus}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search product, order, customer..."
        className={cn(
          "w-full rounded-lg border border-gray-200 bg-gray-100 pl-9 text-sm text-gray-900 transition-all focus:border-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder:text-gray-400 dark:border-border dark:bg-white/5 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:bg-gray-700",
          variant === "sheet" ? "h-12 pr-10 text-base" : "h-10 pr-13"
        )}
      />

      {query ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={onClear}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-200 transition-colors",
            variant === "sheet" ? "right-3" : "right-12"
          )}
        >
          <X className="size-3.5" />
        </button>
      ) : null}

      {variant === "inline" ? (
        <span className="pointer-events-none absolute right-2 top-1/2 inline-flex h-7 w-9 -translate-y-1/2 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-400 dark:border-border dark:bg-white/5">
          ⌘K
        </span>
      ) : null}
    </div>
  )
}

interface SearchResultsProps {
  variant: SearchVariant
  listboxId: string
  query: string
  results: SearchDestination[]
  isSearching: boolean
  selectedIndex: number
  optionRefs: React.RefObject<Map<string, HTMLDivElement>>
  onHighlight: (index: number) => void
  onSelect: (destination: SearchDestination) => void
}

const SearchResults = ({
  variant,
  listboxId,
  query,
  results,
  isSearching,
  selectedIndex,
  optionRefs,
  onHighlight,
  onSelect,
}: SearchResultsProps) => {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md",
        variant === "sheet"
          ? "min-h-0 flex-1 rounded-none border-0"
          : "absolute left-0 right-0 top-full mt-2 w-full z-50 animate-in fade-in-0 zoom-in-95 duration-100"
      )}
    >
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-[11px] font-medium text-muted-foreground bg-muted/30">
        <span>{query ? `Results for "${query}"` : "Quick Navigation"}</span>

        {variant === "inline" ? (
          <div className="flex items-center gap-1.5">
            <span>Navigate</span>
            <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">↑↓</kbd>
            <span>Select</span>
            <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">↵</kbd>
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "overflow-y-auto p-1.5",
          variant === "sheet" ? "min-h-0 flex-1" : "max-h-[360px]"
        )}
      >
        {results.length === 0 ? (
          <div role="status" className="px-4 py-8 text-center">
            {isSearching ? (
              <>
                <Loader2 className="size-6 mx-auto text-muted-foreground mb-2 animate-spin" />
                <p className="text-sm text-muted-foreground">Searching…</p>
              </>
            ) : (
              <>
                <Search className="size-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm font-medium text-foreground">No matches found</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Search pages, or orders, products and customers by name, number or email.
                </p>
              </>
            )}
          </div>
        ) : (
          <div
            id={listboxId}
            role="listbox"
            aria-label="Search results"
            className="divide-y divide-border/20"
          >
            {results.map((item, index) => {
              const isSelected = index === selectedIndex
              const IconComponent = item.icon
              const domId = optionDomId(listboxId, item.id)

              return (
                <div
                  key={item.id}
                  id={domId}
                  role="option"
                  aria-selected={isSelected}
                  ref={(node) => {
                    if (node) {
                      optionRefs.current.set(domId, node)
                    } else {
                      optionRefs.current.delete(domId)
                    }
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => onHighlight(index)}
                  onClick={() => onSelect(item)}
                  className={`group flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-primary/10 text-primary dark:bg-primary/20"
                      : "text-foreground hover:bg-muted/60"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                        isSelected
                          ? "border-primary/30 bg-primary/20 text-primary"
                          : "border-border bg-background text-muted-foreground group-hover:text-foreground"
                      }`}
                    >
                      <IconComponent className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-foreground leading-snug">
                          {item.title}
                        </p>
                        <span className="shrink-0 rounded bg-muted/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {item.section}
                        </span>
                      </div>
                      {item.subtitle && (
                        <p className="truncate text-xs text-muted-foreground mt-0.5">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <CornerDownLeft className="size-3.5 text-muted-foreground" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border/60 bg-muted/20 px-3 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Press <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">Esc</kbd> to close</span>
        <span className="text-primary font-medium flex items-center gap-1">
          NestmartIT Workspace
        </span>
      </div>
    </div>
  )
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({
  mobileOpen = false,
  onMobileOpenChange,
}) => {
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const sheetInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef(new Map<string, HTMLDivElement>())

  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const inlineInputId = `${instanceId}-search-input`
  const inlineListboxId = `${instanceId}-search-listbox`
  const sheetInputId = `${instanceId}-sheet-search-input`
  const sheetListboxId = `${instanceId}-sheet-search-listbox`

  // Pages come from the module registry; records from live backend search.
  const permissions = useAppSelector((state) => state.auth.user?.permissions)
  const navDestinations = useNavDestinations(permissions)
  const { results: recordResults, isSearching } = useRecordSearch(query, permissions)

  // Register global Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setIsOpen(true)

        if (inputRef.current && inputRef.current.offsetParent !== null) {
          inputRef.current.focus()
        } else {
          onMobileOpenChange?.(true)
        }
      }
      if (e.key === "Escape") {
        setIsOpen(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onMobileOpenChange])

  // Close on outside click (the mobile sheet is portalled to the body, so it
  // relies on its own dismissible layer instead)
  useEffect(() => {
    if (mobileOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [mobileOpen])

  // The sheet is only styled below sm, so dismiss it if the viewport grows
  useEffect(() => {
    if (!mobileOpen) return

    const mql = window.matchMedia("(min-width: 640px)")
    const handleBreakpointChange = () => {
      if (mql.matches) {
        setIsOpen(false)
        onMobileOpenChange?.(false)
      }
    }

    mql.addEventListener("change", handleBreakpointChange)
    return () => mql.removeEventListener("change", handleBreakpointChange)
  }, [mobileOpen, onMobileOpenChange])

  // Hide the app behind the sheet from assistive tech. The sheet is portalled
  // to the body, and Radix skips hiding any subtree that contains a live
  // region (this app renders one), so the app root is marked here.
  useEffect(() => {
    if (!mobileOpen) return

    let appRoot: HTMLElement | null = containerRef.current
    while (appRoot?.parentElement && appRoot.parentElement !== document.body) {
      appRoot = appRoot.parentElement
    }

    if (!appRoot || appRoot === document.body) return

    appRoot.setAttribute("aria-hidden", "true")
    appRoot.setAttribute("inert", "")

    return () => {
      appRoot?.removeAttribute("aria-hidden")
      appRoot.removeAttribute("inert")
    }
  }, [mobileOpen])

  // Compute matched items
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return navDestinations.slice(0, 8)

    const matchedNav = navDestinations.filter(
      (route) => route.title.toLowerCase().includes(q) || route.keywords.some((k) => k.includes(q))
    )
    return [...matchedNav.slice(0, 5), ...recordResults]
  }, [query, navDestinations, recordResults])

  // Reset selection index when results change (adjusted during render, not in an effect,
  // so the list never paints once with a stale highlight).
  const [prevResultsLength, setPrevResultsLength] = useState(results.length)
  if (prevResultsLength !== results.length) {
    setPrevResultsLength(results.length)
    setSelectedIndex(0)
  }

  // Keep the highlighted option inside the scroll viewport
  useEffect(() => {
    const activeItem = results[selectedIndex]
    if (!activeItem) return

    const activeListboxId = mobileOpen ? sheetListboxId : inlineListboxId
    optionRefs.current
      .get(optionDomId(activeListboxId, activeItem.id))
      ?.scrollIntoView({ block: "nearest" })
  }, [results, selectedIndex, mobileOpen, inlineListboxId, sheetListboxId])

  const closeSearch = () => {
    setIsOpen(false)
    onMobileOpenChange?.(false)
  }

  const handleSelect = (destination: SearchDestination) => {
    navigate(destination.url)
    closeSearch()
    setQuery("")
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex])
      } else if (query.trim()) {
        // Smart fallback: try to find matching route by query
        const q = query.trim().toLowerCase()
        const fallback = navDestinations.find((r) => r.keywords.some((k) => k.includes(q)) || r.title.toLowerCase().includes(q))
        if (fallback) {
          handleSelect(fallback)
        }
      }
    } else if (e.key === "Escape") {
      closeSearch()
    }
  }

  const hasResults = results.length > 0
  const listVisible = isOpen || mobileOpen
  const listboxOpen = listVisible && hasResults
  const activeItem = listboxOpen ? results[selectedIndex] : undefined

  return (
    <div ref={containerRef} className="relative w-full">
      <SearchField
        variant="inline"
        inputId={inlineInputId}
        listboxId={inlineListboxId}
        inputRef={inputRef}
        query={query}
        expanded={listboxOpen}
        activeDescendantId={
          activeItem ? optionDomId(inlineListboxId, activeItem.id) : undefined
        }
        onQueryChange={(value) => {
          setQuery(value)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        onClear={() => {
          setQuery("")
          inputRef.current?.focus()
        }}
      />

      {listVisible ? (
        <SearchResults
          variant="inline"
          listboxId={inlineListboxId}
          query={query}
          results={results}
          isSearching={isSearching}
          selectedIndex={selectedIndex}
          optionRefs={optionRefs}
          onHighlight={setSelectedIndex}
          onSelect={handleSelect}
        />
      ) : null}

      <Sheet
        open={mobileOpen}
        onOpenChange={(open) => {
          if (!open) setIsOpen(false)
          onMobileOpenChange?.(open)
        }}
      >
        <SheetContent
          side="top"
          showCloseButton={false}
          aria-modal="true"
          className="inset-0 gap-0 p-0 sm:hidden"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            sheetInputRef.current?.focus()
          }}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <SheetTitle>Search</SheetTitle>

            <SheetClose asChild>
              <button
                type="button"
                aria-label="Close search"
                className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                <X className="size-5" />
              </button>
            </SheetClose>
          </div>

          <SheetDescription className="sr-only">
            Search products, orders, customers, expenses, and settings.
          </SheetDescription>

          <div className="px-4 py-3">
            <SearchField
              variant="sheet"
              inputId={sheetInputId}
              listboxId={sheetListboxId}
              inputRef={sheetInputRef}
              query={query}
              expanded={listboxOpen}
              activeDescendantId={
                activeItem ? optionDomId(sheetListboxId, activeItem.id) : undefined
              }
              onQueryChange={(value) => {
                setQuery(value)
                setIsOpen(true)
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              onClear={() => {
                setQuery("")
                sheetInputRef.current?.focus()
              }}
            />
          </div>

          {listVisible ? (
            <SearchResults
              variant="sheet"
              listboxId={sheetListboxId}
              query={query}
              results={results}
              isSearching={isSearching}
              selectedIndex={selectedIndex}
              optionRefs={optionRefs}
              onHighlight={setSelectedIndex}
              onSelect={handleSelect}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
