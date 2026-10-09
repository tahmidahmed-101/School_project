import * as React from "react"
import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table"
import type { ColumnDef, RowData } from "@tanstack/react-table"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, type LucideIcon, XIcon } from "lucide-react"

import { useNavigate } from "react-router-dom"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/use-media-query"
import { EmptyState } from "./EmptyState"
import { AlertCircleIcon, Loader2Icon, ToggleLeft, ToggleRight, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { getApiErrorMessage } from "@/lib/api/client"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "./ConfirmDialog"

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Aligns the column's header and cells on desktop (numbers usually go right). */
    align?: "left" | "center" | "right"
  }
}

// A page-level list scrolls inside whatever the screen has left under the header and
// filters (about 22rem of chrome), with a floor so short screens still show a few rows.
const LIST_HEIGHT = "max-h-[max(24rem,calc(100dvh-15rem))]"

const ALIGN_CLASS = { left: "text-left", center: "text-center", right: "text-right" } as const

/**
 * Renders a column's header or cell. A function is called directly rather than mounted as a
 * component: columns are rebuilt on every render, and mounting a fresh function each time would
 * remount the cell, so an input inside a cell would lose focus on every keystroke.
 */
function renderSlot<TProps>(slot: unknown, context: TProps): React.ReactNode {
  return typeof slot === "function" ? (slot as (props: TProps) => React.ReactNode)(context) : (slot as React.ReactNode)
}

/**
 * Fixed pixel widths on every column make a table as wide as their sum, which forces a sideways
 * scroll on screens that could have fitted it. Letting the widest column take the remaining
 * space keeps the table at the container's width (never below `minWidth`).
 */
function flexWidest(widths: string[]): string[] {
  if (widths.some((w) => !w.endsWith("px"))) return widths
  const px = widths.map((w) => parseFloat(w))
  const widest = px.indexOf(Math.max(...px))
  return widths.map((w, i) => (i === widest ? "auto" : w))
}

/** Column ids DataTable treats specially: the built-in tick box and the row menu. */
const SELECT_COLUMN = "select"
const ACTIONS_COLUMN = "actions"

/**
 * The bulk operations a list supports, shown in the bar while rows are ticked:
 * Cancel is always there, Delete when `deleteRow` is set, Activate / Deactivate when given.
 */
export interface BulkActions<TData> {
  /** Defaults to `row.id`. */
  getId?: (row: TData) => string
  /** Rows that can be ticked. Defaults to every row without a `deleted_at`. */
  isSelectable?: (row: TData) => boolean
  /** Deletes one row. Called once per ticked row; failures are counted and reported. */
  deleteRow?: (row: TData) => Promise<unknown>
  activate?: (rows: TData[]) => Promise<unknown>
  deactivate?: (rows: TData[]) => Promise<unknown>
  /** Runs after any bulk action, e.g. to reload the list. */
  onDone?: () => void
  /** What a row is called in messages, e.g. "product". */
  noun?: string
}

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
  /** True while the current page's data is being fetched. The rows are replaced by a
   * centred spinner until the fetch settles, so stale rows never show alongside the loader. */
  isLoading?: boolean
  /** False while `data` still holds rows fetched for another page; they are not shown. */
  rowsReady?: boolean
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
  /** The actions offered in the bar that appears while rows are ticked (Cancel is always there). */
  bulk?: BulkActions<TData>
  /**
   * Row tick boxes. On for every list table; off by default for `embedded` tables (line items
   * inside a card or dialog) unless they pass `bulk`.
   */
  selectable?: boolean
  /**
   * For a table inside a card, dialog or widget: drops the table's own frame and its
   * scroll height limit, so it sits flush in the container that already frames it.
   */
  embedded?: boolean
  /**
   * What the table sits on, so its pinned header and actions column can match it: the page
   * background (default) or a card. `embedded` tables are always on a card.
   */
  surface?: "page" | "card"
  /** A totals row under the body: one entry per column, in column order (use null to leave one blank). */
  footer?: React.ReactNode[]
}

export function DataTable<TData, TValue>({
  columns,
  data: loadedData,
  rowsReady = true,
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
  bulk,
  selectable: selectableProp,
  embedded = false,
  surface = embedded ? "card" : "page",
  footer,
}: DataTableProps<TData, TValue>) {
  const selectable = selectableProp ?? (Boolean(bulk) || !embedded)
  const data = React.useMemo(() => (rowsReady ? loadedData : []), [rowsReady, loadedData])
  const navigate = useNavigate()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  // Only the layout for this screen size is rendered: building both the table and the
  // card list for every row, then hiding one with CSS, doubled the work of every list page.
  const isDesktop = useMediaQuery("(min-width: 640px)")

  // Rows without an id of their own (report rows) are told apart by their position.
  const getId =
    bulk?.getId ?? ((row: TData) => String((row as { id?: string | number }).id ?? `row-${data.indexOf(row)}`))
  const isSelectable = bulk?.isSelectable ?? ((row: TData) => !(row as { deleted_at?: unknown }).deleted_at)
  const [tickedIds, setTickedIds] = React.useState<string[]>([])
  const [bulkBusy, setBulkBusy] = React.useState(false)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)

  // Only rows still on screen count, so a page or filter change never leaves a hidden selection.
  const selectableRows = selectable ? data.filter(isSelectable) : []
  const selectedRows = selectableRows.filter((row) => tickedIds.includes(getId(row)))
  const allSelected = selectableRows.length > 0 && selectedRows.length === selectableRows.length
  // Remembers the last non-zero count so the bar doesn't flash "0 selected" while it slides shut.
  const [shownCount, setShownCount] = React.useState(0)
  if (selectedRows.length > 0 && selectedRows.length !== shownCount) setShownCount(selectedRows.length)
  const bulkBarOpen = selectedRows.length > 0
  const noun = bulk?.noun ?? "item"
  const plural = (n: number) => `${n} ${n === 1 ? noun : noun.replace(/([^aeiou])y$/, "$1ie") + "s"}`

  const runBulk = async (action: (rows: TData[]) => Promise<unknown>, done: string) => {
    setBulkBusy(true)
    try {
      await action(selectedRows)
      toast.success(`${plural(selectedRows.length)} ${done}`)
      setTickedIds([])
      bulk?.onDone?.()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Bulk update failed"))
    } finally {
      setBulkBusy(false)
    }
  }

  const runBulkDelete = async () => {
    if (!bulk?.deleteRow) return
    setBulkBusy(true)
    let failed = 0
    let firstError: unknown
    // One at a time: the list endpoints are not built for a burst of parallel deletes.
    for (const row of selectedRows) {
      try {
        await bulk.deleteRow(row)
      } catch (err) {
        failed += 1
        firstError ??= err
      }
    }
    const deleted = selectedRows.length - failed
    if (deleted) toast.success(`${plural(deleted)} deleted`)
    if (failed) toast.error(`${plural(failed)} could not be deleted: ${getApiErrorMessage(firstError, "delete failed")}`)
    setBulkBusy(false)
    setTickedIds([])
    bulk.onDone?.()
  }

  const selectColumn: ColumnDef<TData, TValue> = {
    id: SELECT_COLUMN,
    header: () => (
      <Checkbox
        aria-label="Select all on this page"
        checked={allSelected}
        disabled={selectableRows.length === 0}
        onCheckedChange={(v) => setTickedIds(v ? selectableRows.map(getId) : [])}
      />
    ),
    cell: ({ row }) =>
      isSelectable(row.original) ? (
        <Checkbox
          aria-label={`Select row ${row.index + 1}`}
          checked={tickedIds.includes(getId(row.original))}
          onCheckedChange={(v) => {
            const id = getId(row.original)
            setTickedIds((prev) => (v ? [...prev, id] : prev.filter((x) => x !== id)))
          }}
        />
      ) : null,
  }
  const allColumns = selectable ? [selectColumn, ...columns] : columns

  const table = useReactTable({
    data,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    ...(manualPagination
      ? {
          manualPagination: true,
          pageCount: controlledPageCount,
          state: { pagination: { pageIndex: controlledPageIndex, pageSize } },
        }
      : showPagination
        ? {
            getPaginationRowModel: getPaginationRowModel(),
            initialState: { pagination: { pageSize } },
          }
        : {}),
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

  const widths = [...(selectable ? ["48px"] : []), ...flexWidest(columnWidths ?? columns.map(() => "auto"))]

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
        map.set(header.column.id, renderSlot(header.column.columnDef.header, header.getContext()))
      }
    }
    return map
    // `table` is a stable reference, so columns/data are what actually signal a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, columns, data, allColumns.length])

  const headerlessIds = React.useMemo(
    () => new Set([SELECT_COLUMN, ACTIONS_COLUMN, ...(unlabelledColumns ?? [])]),
    [unlabelledColumns]
  )

  const rows = table.getRowModel().rows

  // A line between every pair of columns. The pinned actions column draws its own left edge
  // (it has to, to stay visible over scrolled cells), so the column before it adds none.
  const columnIds = table.getVisibleLeafColumns().map((column) => column.id)
  const dividerClass = (index: number) =>
    index < columnIds.length - 1 && columnIds[index + 1] !== ACTIONS_COLUMN && "border-r border-border"

  const showError = !isLoading && Boolean(error) && data.length === 0
  const showEmpty = !isLoading && !showError && rows.length === 0

  return (
    <div
      data-surface={surface}
      className={cn("data-table flex flex-col overflow-hidden", !embedded && "rounded-xl border border-border")}
    >
      {selectable && (
        // Animating the grid row from 0fr to 1fr slides the bar open at its natural height.
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
            bulkBarOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}
          inert={!bulkBarOpen}
        >
          <div className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-sm">
              <span className="mr-1 font-medium">{shownCount} selected</span>
              {bulk?.activate && (
                <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => runBulk(bulk.activate!, "activated")}>
                  <ToggleRight /> Activate
                </Button>
              )}
              {bulk?.deactivate && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkBusy}
                  onClick={() => runBulk(bulk.deactivate!, "deactivated")}
                >
                  <ToggleLeft /> Deactivate
                </Button>
              )}
              {bulk?.deleteRow && (
                <Button size="sm" variant="destructive" disabled={bulkBusy} onClick={() => setConfirmingDelete(true)}>
                  <Trash2Icon /> Delete
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => setTickedIds([])}>
                <XIcon className="size-4" />
                Cancel
              </Button>
              {bulkBusy && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />}
            </div>
          </div>
        </div>
      )}
      {bulk?.deleteRow && (
        <ConfirmDialog
          open={confirmingDelete}
          onOpenChange={setConfirmingDelete}
          title={`Delete ${plural(selectedRows.length)}?`}
          description="The selected rows will be deleted. This action cannot be undone."
          confirmLabel="Delete"
          destructive
          icon={<Trash2Icon />}
          onConfirm={runBulkDelete}
        />
      )}
      {/* ---- Desktop: one table in one scroll container. The header is sticky, so it stays
           pinned while rows scroll vertically and moves with them horizontally. ---- */}
      {isDesktop ? (
      <div>
        {/* Stale-data error banner — shown above existing rows when a refetch fails but we still have data to show */}
        {!isLoading && Boolean(error) && data.length > 0 && <StaleErrorBanner error={error} onRetry={onRetry} />}

        <div ref={scrollRef} className={cn("overflow-auto table-scroll", !embedded && LIST_HEIGHT)}>
          {/* A plain <table>, not <Table>: that wrapper adds its own overflow container, which
              would scroll on its own and break the sticky header. */}
          <table
            data-slot="table"
            // Separate borders: with collapsed ones the pinned actions cell paints over some of
            // the row lines, so each cell draws its own bottom border instead.
            className="w-full table-fixed border-separate border-spacing-0 caption-bottom text-sm"
            style={{ minWidth }}
          >
            <ColGroup />
            <TableHeader className="sticky top-0 z-10 bg-(--table-bg) shadow-[inset_0_-1px_0_var(--border)]">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-b-0 hover:bg-transparent">
                  {headerGroup.headers.map((header, i) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "text-xs font-medium text-muted-foreground uppercase tracking-wide py-3",
                        dividerClass(i),
                        ALIGN_CLASS[header.column.columnDef.meta?.align ?? "left"],
                        // Pinned to the right edge so the row menu is reachable without scrolling sideways.
                        header.column.id === ACTIONS_COLUMN &&
                          "sticky right-0 z-20 bg-(--table-bg) text-center shadow-[inset_1px_0_0_var(--border),inset_0_-1px_0_var(--border)]"
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : renderSlot(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={allColumns.length} className="p-0 border-0">
                      <TableLoader />
                    </TableCell>
                  </TableRow>
                ) : showError ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={allColumns.length} className="p-0 border-0">
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
                        "group/row border-0 transition-colors duration-200 hover:bg-(--table-hover)",
                        isClickable &&
                          "cursor-pointer active:bg-(--table-active) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      )}
                    >
                      {row.getVisibleCells().map((cell, i) => (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            // Columns have fixed widths, so content longer than its column is cut off
                            // with "…" inside the cell rather than running over the next column.
                            "overflow-hidden text-ellipsis border-b border-border py-3.5 group-last/row:border-b-0",
                            dividerClass(i),
                            ALIGN_CLASS[cell.column.columnDef.meta?.align ?? "left"],
                            // Opaque, so scrolled cells don't show through; matches the row's hover tint.
                            cell.column.id === ACTIONS_COLUMN &&
                              "sticky right-0 bg-(--table-bg) shadow-[inset_1px_0_0_var(--border)] transition-colors duration-200 group-hover/row:bg-(--table-hover)",
                            cell.column.id === ACTIONS_COLUMN &&
                              isClickable &&
                              "group-active/row:bg-(--table-active)"
                          )}
                        >
                          {renderSlot(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={allColumns.length} className="p-0 border-0">
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
              {footer && rows.length > 0 && (
                <tfoot data-slot="table-footer" className="font-semibold">
                  <tr>
                    {allColumns.map((column, i) => {
                      const cell = footer[i - (selectable ? 1 : 0)]
                      return (
                        <td
                          key={i}
                          className={cn(
                            "border-t border-border bg-muted/40 px-3 py-3 tabular-nums",
                            dividerClass(i),
                            ALIGN_CLASS[column.meta?.align ?? "left"]
                          )}
                        >
                          {cell ?? null}
                        </td>
                      )
                    })}
                  </tr>
                </tfoot>
              )}
          </table>
        </div>
      </div>
      ) : (
      // ---- Mobile (< sm): stacked cards, so no horizontal scrolling is needed ----
      <div>
        {!isLoading && Boolean(error) && data.length > 0 && <StaleErrorBanner error={error} onRetry={onRetry} />}

        <div className={cn(!embedded && "overflow-y-auto", !embedded && LIST_HEIGHT)}>
          {isLoading ? (
            <TableLoader />
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
                const allCells = row.getVisibleCells()
                const selectCell = allCells.find((cell) => cell.column.id === SELECT_COLUMN)
                const cells = allCells.filter((cell) => cell !== selectCell)
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
                        "space-y-2.5 p-4 transition-colors duration-200 hover:bg-(--table-hover)",
                        isClickable &&
                          "cursor-pointer active:bg-(--table-active) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        {selectCell && (
                          <div className="flex h-5 shrink-0 items-center">
                            {renderSlot(selectCell.column.columnDef.cell, selectCell.getContext())}
                          </div>
                        )}
                        <div className="min-w-0 flex-1 font-medium">
                          {headingCell
                            ? renderSlot(headingCell.column.columnDef.cell, headingCell.getContext())
                            : null}
                        </div>
                        {trailingCells.length > 0 && (
                          <div className="flex shrink-0 items-center gap-1">
                            {trailingCells.map((cell) => (
                              <React.Fragment key={cell.id}>
                                {renderSlot(cell.column.columnDef.cell, cell.getContext())}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </div>

                      {detailCells.length > 0 && (
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          {detailCells.map((cell) => (
                            <div key={cell.id} className="min-w-0">
                              <dt className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                {headerLabels.get(cell.column.id) ?? null}
                              </dt>
                              <dd className="min-w-0 break-words">
                                {renderSlot(cell.column.columnDef.cell, cell.getContext())}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {footer && rows.length > 0 && (
            <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t border-border bg-muted/40 p-4 text-sm font-semibold">
              {columns.map((column, i) =>
                footer[i] == null || i === 0 ? null : (
                  <React.Fragment key={i}>
                    <dt className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {headerLabels.get(column.id ?? String((column as { accessorKey?: string }).accessorKey)) ?? null}
                    </dt>
                    <dd className="tabular-nums">{footer[i]}</dd>
                  </React.Fragment>
                )
              )}
            </dl>
          )}
        </div>
      </div>
      )}

      {/* Pagination */}
      {showPagination && (
        <div className="flex items-center justify-center gap-4 border-t border-border px-4 py-2.5 text-center sm:justify-between flex-wrap">
          <p className="text-xs text-muted-foreground">
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

/** Spinner shown in place of the rows while a fetch is in flight. */
function TableLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <Loader2Icon className="size-6 animate-spin text-primary" />
      Loading…
    </div>
  )
}

function StaleErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-destructive/5 px-4 py-2 text-xs text-destructive">
      <AlertCircleIcon className="size-3.5 shrink-0" />
      <span className="flex-1">{getApiErrorMessage(error, "Couldn't refresh this data.")}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2 hover:no-underline">
          Retry
        </button>
      )}
    </div>
  )
}
