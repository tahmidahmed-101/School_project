import { useCallback, useEffect, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeading } from "@/components/common/PageHeading"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchAll } from "@/features/audit/slices/loginHistorySlice"
import type { LoginHistoryEntry } from "@/features/audit/types"
import { useDebounced } from "@/features/system/useDebounced"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { formatDateTime } from "@/lib/format"

const PAGE_SIZE = 25

const LoginHistory = () => {
  useDocumentTitle("Login History")

  const dispatch = useAppDispatch()
  const { data, totalItems, meta, isFetchingList, error } = useAppSelector((state) => state.loginHistory)

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounced(search.trim())
  const [ordering, setOrdering] = useState("-created_at")

  const load = useCallback(
    () =>
      dispatch(
        fetchAll({ page, page_size: PAGE_SIZE, ordering, ...(debouncedSearch ? { search: debouncedSearch } : {}) })
      ),
    [dispatch, page, ordering, debouncedSearch]
  )

  useEffect(() => {
    const request = load()
    return () => request.abort()
  }, [load])

  const columns: ColumnDef<LoginHistoryEntry>[] = [
    {
      accessorKey: "created_at",
      header: "DATE",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">{formatDateTime(row.original.created_at)}</span>
      ),
    },
    {
      accessorKey: "email",
      header: "EMAIL",
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.email || "—"}</span>,
    },
    {
      accessorKey: "ip_address",
      header: "IP ADDRESS",
      cell: ({ row }) => <span className="font-mono text-sm text-muted-foreground">{row.original.ip_address || "—"}</span>,
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
      <PageHeading title="Login History" description="Sign-in attempts to the dashboard and storefront." />

      <FilterToolbar
        searchPlaceholder="Search by email or IP address..."
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value)
          setPage(1)
        }}
        filters={[
          {
            component: (
              <Select
                value={ordering}
                onValueChange={(value) => {
                  setOrdering(value)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[160px]" aria-label="Sort sign-ins">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-created_at">Newest first</SelectItem>
                  <SelectItem value="created_at">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={data}
        pageSize={PAGE_SIZE}
        isLoading={isFetchingList}
        error={error}
        onRetry={load}
        manualPagination
        pageIndex={page - 1}
        pageCount={meta?.totalPages ?? 1}
        totalCount={totalItems}
        onPageChange={(index) => setPage(index + 1)}
        emptyTitle="No sign-ins found"
        emptyDescription="No sign-in attempts match this search."
        minWidth="720px"
        columnWidths={["200px", "280px", "180px", "130px"]}
      />
    </div>
  )
}

export default LoginHistory
