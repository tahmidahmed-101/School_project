import { useState } from "react"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { BookOpen, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { Combobox } from "@/components/common/ComboBox"
import { TableActions } from "@/components/common/TableActions"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeader } from "@/components/common/PageHeader"
import { SortSelect } from "@/components/common/SortSelect"
import { DateCell, MoneyCell } from "@/components/common/cells"
import { humanize } from "@/lib/format"
import type { Option } from "@/lib/types"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { useListPage } from "@/hooks/use-list-page"

import { fetchAll } from "../slices/journalEntrySlice"
import type { JournalEntry } from "../types"
import { useAccounts } from "../hooks/useFinanceHelpers"
import { JournalEntryFormDialog } from "./JournalEntryFormDialog"
import { entryTotal } from "../utils"

const ORDERING_OPTIONS: Option[] = [
  { label: "Newest first", value: "-entry_date" },
  { label: "Oldest first", value: "entry_date" },
]

// reference_type values written by the backend's posting services.
const REFERENCE_TYPES = [
  "customer_payment",
  "customer_refund",
  "shipment_revenue",
  "shipment_cogs",
  "rma_revenue_reversal",
  "rma_cogs_reversal",
  "goods_receipt_line",
  "vendor_bill",
  "vendor_payment",
  "stock_adjustment",
  "stock_writeoff",
  "expense",
]

const JournalEntries = () => {
  useDocumentTitle("Journal entries")
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const listState = useAppSelector((state) => state.journalEntries)
  const canPost = useCan("accounting.post")
  const { accounts } = useAccounts()

  const [referenceType, setReferenceType] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const list = useListPage({
    fetch: (params) => dispatch(fetchAll(params)),
    state: listState,
    params: { reference_type: referenceType?.value, ordering: ordering?.value },
  })

  const columns: ColumnDef<JournalEntry>[] = [
    {
      accessorKey: "entry_date",
      header: "DATE",
      cell: ({ row }) => <DateCell value={row.original.entry_date} className="text-muted-foreground" />,
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
      cell: ({ row }) => <MoneyCell value={entryTotal(row.original)} emphasis className="text-foreground" />,
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
      header: "ACTIONS",
      cell: ({ row }) => (
        <TableActions itemName="journal entry" viewUrl={`/accounting/journal-entries/${row.original.id}`} />
      ),
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Journal entries"
        actions={
          canPost && (
            <Button size="action" onClick={() => setFormOpen(true)}>
              <Plus className="size-5" /> New Journal Entry
            </Button>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search description..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[
          {
            component: (
              <Combobox
                options={REFERENCE_TYPES.map((t) => ({ label: humanize(t), value: t }))}
                placeholder="Source"
                value={referenceType}
                onValueChange={setReferenceType}
              />
            ),
          },
          { component: <SortSelect options={ORDERING_OPTIONS} value={ordering} onChange={setOrdering} /> },
        ]}
      />

      <DataTable
        columns={columns}
        data={listState.data}
        {...list.tableProps}
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
