import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  type LucideIcon,
} from "lucide-react"

import { useNavigate } from "react-router-dom"
import { cn } from "@/lib/utils"
import { EmptyState } from "./EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertCircleIcon, Loader2Icon } from "lucide-react"
import { getApiErrorMessage } from "@/lib/api/client"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  pageSize?: number
  columnWidths?: string[]
  minWidth?: string
  showPagination?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyIcon?: LucideIcon
  emptyActionLabel?: string
  onEmptyAction?: () => void
  /** True while the current page's data is being fetched. On first load (no data yet)
   * this renders skeleton rows; on a refetch with existing data it dims the table and
   * shows a small inline spinner instead of replacing the rows the user is looking at. */
  isLoading?: boolean
  /** Set when the fetch backing this table failed — from the slice's `error` field. */
  error?: unknown
  /** Shown as a "Retry" action on the error state, when the fetch can be re-dispatched. */
  onRetry?: () => void
  /** Server-side pagination mode: `data` is just the current page, and page changes are
   * driven by `onPageChange` (e.g. dispatching `fetchAll({page})`) instead of client-side slicing. */
  manualPagination?: boolean
  pageIndex?: number
  pageCount?: number
  totalCount?: number
  onPageChange?: (pageIndex: number) => void
  onRowClick?: (row: TData) => void
  getRowLink?: (row: TData) => string
  /** Column ids that are pure selection/action affordances (e.g. a checkbox column) and so
   * carry no label in the mobile card layout. Optional — the layout falls back to the
   * column header, and headerless columns are rendered without a label automatically. */
  unlabelledColumns?: string[]
}

export function DataTable<TData, TValue>({
  columns,
  data,
  pageSize = 15,
  columnWidths,
  minWidth = "700px",
  showPagination = true,
  emptyTitle = "No records found",
  emptyDescription = "There are no items matching your criteria or available in this view.",
  emptyIcon,
  emptyActionLabel,
  onEmptyAction,
  isLoading = false,
  error = null,
  onRetry,
  manualPagination = false,
  pageIndex: controlledPageIndex = 0,
  pageCount: controlledPageCount = 1,
  totalCount,
  onPageChange,
  onRowClick,
  getRowLink,
  unlabelledColumns,
}: DataTableProps<TData, TValue>) {
  const navigate = useNavigate()
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    ...(manualPagination
      ? {
          manualPagination: true,
          pageCount: controlledPageCount,
          state: { pagination: { pageIndex: controlledPageIndex, pageSize } },
        }
      : {
          getPaginationRowModel: getPaginationRowModel(),
          initialState: { pagination: { pageSize } },
        }),
  })

  const pageIndex = manualPagination ? controlledPageIndex : table.getState().pagination.pageIndex
  const currentPageSize = manualPagination ? pageSize : table.getState().pagination.pageSize
  const pageCount = manualPagination ? controlledPageCount : table.getPageCount()
  const totalRows = manualPagination ? totalCount ?? data.length : table.getFilteredRowModel().rows.length
  const from = totalRows === 0 ? 0 : pageIndex * currentPageSize + 1
  const to = manualPagination
    ? Math.min(pageIndex * currentPageSize + data.length, totalRows)
    : Math.min((pageIndex + 1) * currentPageSize, totalRows)
  const canPreviousPage = manualPagination ? pageIndex > 0 : table.getCanPreviousPage()
  const canNextPage = manualPagination ? pageIndex < pageCount - 1 : table.getCanNextPage()

  const goToPage = (fn: () => void, targetIndex?: number) => {
    if (manualPagination) {
      if (targetIndex !== undefined) onPageChange?.(targetIndex)
    } else {
      fn()
    }
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }

  const widths = columnWidths ?? columns.map(() => "auto")

  const ColGroup = () => (
    <colgroup>
      {widths.map((w, i) => (
        <col key={i} style={{ width: w }} />
      ))}
    </colgroup>
  )

  const isClickable = Boolean(onRowClick || getRowLink)

  // A click inside an interactive descendant belongs to that control, not the row.
  const shouldIgnoreRowClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    const target = e.target as HTMLElement | null
    return Boolean(
      target?.closest("button") ||
        target?.closest("a") ||
        target?.closest("input") ||
        target?.closest("select") ||
        target?.closest("textarea") ||
        target?.closest("[role='checkbox']") ||
        target?.closest("[role='menuitem']") ||
        target?.closest("[data-no-row-click]")
    )
  }

  const activateRow = (rowOriginal: TData) => {
    if (onRowClick) {
      onRowClick(rowOriginal)
    } else if (getRowLink) {
      navigate(getRowLink(rowOriginal))
    }
  }

  const handleRowClick = (e: React.MouseEvent, rowOriginal: TData) => {
    if (!isClickable) return
    if (shouldIgnoreRowClick(e)) return
    activateRow(rowOriginal)
  }

  // Rows are only focusable/activatable via keyboard when they actually navigate.
  const handleRowKeyDown = (e: React.KeyboardEvent, rowOriginal: TData) => {
    if (!isClickable) return
    if (e.key !== "Enter" && e.key !== " ") return
    if (shouldIgnoreRowClick(e)) return
    e.preventDefault()
    activateRow(rowOriginal)
  }

  // Map each column id to its rendered header so the mobile card layout can label
  // every value. Headerless columns (selection checkboxes, spacer cells) stay unlabelled.
  const headerLabels = React.useMemo(() => {
    const map = new Map<string, React.ReactNode>()
    for (const group of table.getHeaderGroups()) {
      for (const header of group.headers) {
        if (header.isPlaceholder) continue
        map.set(header.column.id, flexRender(header.column.columnDef.header, header.getContext()))
      }
    }
    return map
    // `table` is a stable reference, so columns/data are what actually signal a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, columns, data])

  const headerlessIds = React.useMemo(() => new Set(unlabelledColumns ?? []), [unlabelledColumns])

  const rows = table.getRowModel().rows

  const showSkeleton = isLoading && data.length === 0
  const showError = Boolean(error) && data.length === 0
  const showEmpty = !showSkeleton && !showError && rows.length === 0

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* ---- Desktop: one table in one scroll container. The header is sticky, so it stays
           pinned while rows scroll vertically and moves with them horizontally. ---- */}
      <div className="hidden sm:block">
        {/* Stale-data error banner — shown above existing rows when a refetch fails but we still have data to show */}
        {Boolean(error) && data.length > 0 && (
          <div className="flex items-center gap-2 border-b border-border bg-destructive/5 px-4 py-2 text-xs text-destructive">
            <AlertCircleIcon className="size-3.5 shrink-0" />
            <span className="flex-1">{getApiErrorMessage(error, "Couldn't refresh this data.")}</span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="font-medium underline underline-offset-2 hover:no-underline"
              >
                Retry
              </button>
            )}
          </div>
        )}

        <div ref={scrollRef} className="overflow-auto max-h-[500px] table-scroll">
          {/* A plain <table>, not <Table>: that wrapper adds its own overflow container, which
              would scroll on its own and break the sticky header. */}
          <table
            data-slot="table"
            className="w-full table-fixed caption-bottom text-sm"
            style={{ minWidth }}
          >
            <ColGroup />
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--border)]">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-b-0 hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="text-xs font-medium text-muted-foreground uppercase tracking-wide py-3"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
              <TableBody
                className={cn(
                  isLoading && data.length > 0 && "pointer-events-none opacity-60 transition-opacity"
                )}
              >
                {showSkeleton ? (
                  Array.from({ length: Math.min(pageSize, 8) }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                      {columns.map((_, j) => (
                        <TableCell key={j} className="py-3.5">
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : showError ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={columns.length} className="p-0 border-0">
                      <EmptyState
                        icon={AlertCircleIcon}
                        title="Couldn't load this data"
                        description={getApiErrorMessage(error)}
                        actionLabel={onRetry ? "Retry" : undefined}
                        onAction={onRetry}
                      />
                    </TableCell>
                  </TableRow>
                ) : rows.length ? (
                  rows.map((row) => (
                    <TableRow
                      key={row.id}
                      onClick={(e) => handleRowClick(e, row.original)}
                      onKeyDown={(e) => handleRowKeyDown(e, row.original)}
                      tabIndex={isClickable ? 0 : undefined}
                      role={isClickable ? "button" : undefined}
                      aria-label={isClickable ? `Open row ${row.index + 1}` : undefined}
                      className={cn(
                        "border-b border-border transition-colors last:border-0",
                        isClickable
                          ? "cursor-pointer hover:bg-muted/50 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                          : "hover:bg-muted/50"
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="py-3.5">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={columns.length} className="p-0 border-0">
                      <EmptyState
                        icon={emptyIcon}
                        title={emptyTitle}
                        description={emptyDescription}
                        actionLabel={emptyActionLabel}
                        onAction={onEmptyAction}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
          </table>
        </div>
      </div>

      {/* ---- Mobile (< sm): stacked cards, so no horizontal scrolling is needed ---- */}
      <div className="sm:hidden">
        {Boolean(error) && data.length > 0 && (
          <div className="flex items-center gap-2 border-b border-border bg-destructive/5 px-4 py-2 text-xs text-destructive">
            <AlertCircleIcon className="size-3.5 shrink-0" />
            <span className="flex-1">{getApiErrorMessage(error, "Couldn't refresh this data.")}</span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="font-medium underline underline-offset-2 hover:no-underline"
              >
                Retry
              </button>
            )}
          </div>
        )}

        <div
          className={cn(
            "max-h-[500px] overflow-y-auto",
            isLoading && data.length > 0 && "pointer-events-none opacity-60 transition-opacity"
          )}
        >
          {showSkeleton ? (
            <div className="divide-y divide-border">
              {Array.from({ length: Math.min(pageSize, 6) }).map((_, i) => (
                <div key={`skeleton-${i}`} className="space-y-2 p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : showError ? (
            <EmptyState
              icon={AlertCircleIcon}
              title="Couldn't load this data"
              description={getApiErrorMessage(error)}
              actionLabel={onRetry ? "Retry" : undefined}
              onAction={onRetry}
            />
          ) : showEmpty ? (
            <EmptyState
              icon={emptyIcon}
              title={emptyTitle}
              description={emptyDescription}
              actionLabel={emptyActionLabel}
              onAction={onEmptyAction}
            />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row) => {
                const cells = row.getVisibleCells()
                // The first labelled cell is treated as the card's heading (it is the
                // primary entity in every table here), the rest become label/value pairs.
                const headingIndex = cells.findIndex(
                  (cell) => !headerlessIds.has(cell.column.id) && headerLabels.has(cell.column.id)
                )
                const headingCell = headingIndex >= 0 ? cells[headingIndex] : undefined
                const detailCells = cells.filter(
                  (cell, i) => i !== headingIndex && !headerlessIds.has(cell.column.id)
                )
                const trailingCells = cells.filter(
                  (cell, i) => i !== headingIndex && headerlessIds.has(cell.column.id)
                )

                return (
                  <li key={row.id}>
                    <div
                      role={isClickable ? "button" : undefined}
                      tabIndex={isClickable ? 0 : undefined}
                      onClick={(e) => handleRowClick(e, row.original)}
                      onKeyDown={(e) => handleRowKeyDown(e, row.original)}
                      className={cn(
                        "space-y-3 p-4 transition-colors",
                        isClickable &&
                          "cursor-pointer hover:bg-muted/50 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 font-medium">
                          {headingCell
                            ? flexRender(headingCell.column.columnDef.cell, headingCell.getContext())
                            : null}
                        </div>
                        {trailingCells.length > 0 && (
                          <div className="flex shrink-0 items-center gap-1">
                            {trailingCells.map((cell) => (
                              <React.Fragment key={cell.id}>
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </div>

                      {detailCells.length > 0 && (
                        <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                          {detailCells.map((cell) => (
                            <React.Fragment key={cell.id}>
                              <dt className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {headerLabels.get(cell.column.id) ?? null}
                              </dt>
                              <dd className="min-w-0 break-words">
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </dd>
                            </React.Fragment>
                          ))}
                        </dl>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Pagination */}
      {showPagination && (
        <div className="flex items-center justify-center gap-4 border-t border-border bg-card px-4 py-2.5 text-center sm:justify-between flex-wrap">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isLoading && data.length > 0 && <Loader2Icon className="size-3 animate-spin" />}
            Showing <span className="font-medium text-foreground">{from}–{to}</span> of{" "}
            <span className="font-medium text-foreground">{totalRows}</span> results
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="First page"
              onClick={() => goToPage(() => table.setPageIndex(0), 0)}
              disabled={!canPreviousPage}
            >
              <ChevronsLeftIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous page"
              onClick={() => goToPage(() => table.previousPage(), pageIndex - 1)}
              disabled={!canPreviousPage}
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>

            {Array.from({ length: pageCount }, (_, i) => i)
              .filter(
                (i) =>
                  i === 0 ||
                  i === pageCount - 1 ||
                  Math.abs(i - pageIndex) <= 1
              )
              .reduce((acc: (number | string)[], i, idx, arr) => {
                if (idx > 0 && (arr[idx - 1] as number) + 1 < i) acc.push("...")
                acc.push(i)
                return acc
              }, [])
              .map((item, idx) =>
                item === "..." ? (
                  <span key={`ellipsis-${idx}`} className="text-xs text-muted-foreground px-1">…</span>
                ) : (
                  <Button
                    key={item}
                    variant={pageIndex === item ? "default" : "ghost"}
                    size="icon"
                    className="text-xs"
                    aria-label={`Page ${(item as number) + 1}`}
                    aria-current={pageIndex === item ? "page" : undefined}
                    onClick={() => goToPage(() => table.setPageIndex(item as number), item as number)}
                  >
                    {(item as number) + 1}
                  </Button>
                )
              )}

            <Button
              variant="ghost"
              size="icon"
              aria-label="Next page"
              onClick={() => goToPage(() => table.nextPage(), pageIndex + 1)}
              disabled={!canNextPage}
            >
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Last page"
              onClick={() => goToPage(() => table.setPageIndex(pageCount - 1), pageCount - 1)}
              disabled={!canNextPage}
            >
              <ChevronsRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
