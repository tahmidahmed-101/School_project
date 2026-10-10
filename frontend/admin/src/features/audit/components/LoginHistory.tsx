import { useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { SortSelect } from "@/components/common/SortSelect"
import { StatusBadge } from "@/components/common/StatusBadge"
import { DateCell, TextCell } from "@/components/common/cells"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchAll } from "@/features/audit/slices/loginHistorySlice"
import type { LoginHistoryEntry } from "@/features/audit/types"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import type { Option } from "@/lib/types"

const ORDERING_OPTIONS: Option[] = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
]

const PAGE_SIZE = 25

const LoginHistory = () => {
  useDocumentTitle("Login history")

  const dispatch = useAppDispatch()
  const historyState = useAppSelector((state) => state.loginHistory)

  const [ordering, setOrdering] = useState<Option | null>(ORDERING_OPTIONS[0])

  const list = useListPage({
    fetch: (params) => dispatch(fetchAll(params)),
    state: historyState,
    params: { ordering: ordering?.value ?? ORDERING_OPTIONS[0].value },
    pageSize: PAGE_SIZE,
  })

  const columns: ColumnDef<LoginHistoryEntry>[] = [
    {
      accessorKey: "created_at",
      header: "DATE",
      cell: ({ row }) => <DateCell withTime value={row.original.created_at} className="text-muted-foreground" />,
    },
    {
      accessorKey: "email",
      header: "EMAIL",
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.email || "—"}</span>,
    },
    {
      accessorKey: "ip_address",
      header: "IP ADDRESS",
      cell: ({ row }) => <TextCell muted value={row.original.ip_address} className="font-mono" />,
    },
    {
      accessorKey: "was_successful",
      header: "RESULT",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.was_successful ? "succeeded" : "failed"}
          label={row.original.was_successful ? "Signed in" : "Failed"}
        />
      ),
    },
  ]

  return (
    <div className="section-container">
      <PageHeader title="Login history" />

      <FilterToolbar
        searchPlaceholder="Search by email or IP address..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[{ component: <SortSelect options={ORDERING_OPTIONS} value={ordering} onChange={setOrdering} /> }]}
      />

      <DataTable
        columns={columns}
        data={historyState.data}
        {...list.tableProps}
        emptyTitle="No sign-ins found"
        emptyDescription="No sign-in attempts match this search."
        minWidth="720px"
        columnWidths={["210px", "280px", "180px", "130px"]}
      />
    </div>
  )
}

export default LoginHistory
