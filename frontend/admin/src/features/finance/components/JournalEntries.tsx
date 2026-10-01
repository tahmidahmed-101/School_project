import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { BookOpen, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { TableActions } from "@/components/common/TableActions"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeading } from "@/components/common/PageHeading"
import { formatCurrency, formatDate, humanize } from "@/lib/format"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"

import { fetchAll } from "../slices/journalEntrySlice"
import type { JournalEntry } from "../types"
import { useAccounts, useCan, useDebouncedValue } from "../hooks/useFinanceHelpers"
import { JournalEntryFormDialog } from "./JournalEntryFormDialog"
import { entryTotal } from "../utils"

const PAGE_SIZE = 20

type Option = { label: string; value: string }

// reference_type values written by the backend's posting services.
const REFERENCE_TYPES = [
  "expense",
  "vendor_bill",
  "vendor_payment",
  "goods_receipt",
  "customer_payment",
  "customer_refund",
  "shipment",
  "rma",
  "stock_adjustment",
  "stock_intake",
  "stock_writeoff",
  "write_off",
  "adjustment",
]

const JournalEntries = () => {
  useDocumentTitle("Journal Entries")
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { data, isFetchingList, error, totalItems, meta } = useAppSelector((state) => state.journalEntries)
  const canPost = useCan("accounting.post")
  const { accounts } = useAccounts()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search)
  const [referenceType, setReferenceType] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const load = useCallback(
    () =>
      dispatch(
        fetchAll({
          page,
          page_size: PAGE_SIZE,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(referenceType ? { reference_type: referenceType.value } : {}),
          ...(ordering ? { ordering: ordering.value } : {}),
        })
      ),
    [dispatch, page, debouncedSearch, referenceType, ordering]
  )

  useEffect(() => {
    const request = load()
    return () => request.abort()
  }, [load])

  const columns: ColumnDef<JournalEntry>[] = [
    {
      accessorKey: "entry_date",
      header: "DATE",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(row.original.entry_date)}</span>
      ),
    },
    {
      accessorKey: "description",
      header: "DESCRIPTION",
      cell: ({ row }) => (
        <p className="text-sm font-medium text-foreground line-clamp-2 pr-3">{row.original.description || "—"}</p>
      ),
    },
    {
      accessorKey: "reference_type",
      header: "SOURCE",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.reference_type ? humanize(row.original.reference_type) : "Manual"}
        </span>
      ),
    },
    {
      id: "lines",
      header: "LINES",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.lines.length}</span>,
    },
    {
      id: "total",
      header: "AMOUNT",
      cell: ({ row }) => (
        <span className="text-sm font-semibold text-foreground whitespace-nowrap">
          {formatCurrency(entryTotal(row.original))}
        </span>
      ),
    },
    {
      id: "status",
      header: "STATUS",
      cell: ({ row }) => {
        const e = row.original
        if (e.reversed_by_id) return <StatusBadge status="reversed" tone="secondary" />
        if (e.reverses_id) return <StatusBadge status="reversal" tone="warning" />
        return <StatusBadge status={e.status} tone={e.status === "posted" ? "success" : "secondary"} />
      },
    },
    {
      id: "actions",
      header: "ACTION",
      cell: ({ row }) => (
        <TableActions itemName="journal entry" viewUrl={`/accounting/journal-entries/${row.original.id}`} />
      ),
    },
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading
          title="Journal Entries"
          description="The general ledger. Entries are posted once and never edited — corrections are reversing entries."
        />
        {canPost && (
          <Button size="action" onClick={() => setFormOpen(true)}>
            <Plus className="size-5" /> New Journal Entry
          </Button>
        )}
      </div>

      <FilterToolbar
        searchPlaceholder="Search description..."
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        filters={[
          {
            component: (
              <ExampleComboboxCustomItems
                frameworks={REFERENCE_TYPES.map((t) => ({ label: humanize(t), value: t }))}
                placeholder="Source"
                value={referenceType}
                onValueChange={(v) => {
                  setReferenceType(v)
                  setPage(1)
                }}
              />
            ),
          },
          {
            component: (
              <ExampleComboboxCustomItems
                frameworks={[
                  { label: "Newest first", value: "-entry_date" },
                  { label: "Oldest first", value: "entry_date" },
                ]}
                placeholder="Sort"
                value={ordering}
                onValueChange={(v) => {
                  setOrdering(v)
                  setPage(1)
                }}
              />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={isFetchingList}
        error={error}
        onRetry={() => {
          load()
        }}
        manualPagination
        pageSize={PAGE_SIZE}
        pageIndex={page - 1}
        pageCount={meta?.totalPages ?? 1}
        totalCount={totalItems}
        onPageChange={(index) => setPage(index + 1)}
        onRowClick={(e) => navigate(`/accounting/journal-entries/${e.id}`)}
        emptyIcon={BookOpen}
        emptyTitle="No journal entries"
        minWidth="980px"
        columnWidths={["110px", "320px", "150px", "70px", "130px", "110px", "80px"]}
      />

      <JournalEntryFormDialog open={formOpen} onOpenChange={setFormOpen} accounts={accounts} />
    </div>
  )
}

export default JournalEntries
