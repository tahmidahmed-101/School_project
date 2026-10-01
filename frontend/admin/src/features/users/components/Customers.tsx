import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { BanIcon, RotateCcwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { TableActions } from "@/components/common/TableActions"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeading } from "@/components/common/PageHeading"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { bulkDeactivateUsers, fetchAll, postData, restoreUser } from "@/features/users/slices/customerSlice"
import { displayNameOf, type AdminUser } from "@/features/users/types"
import { useDebounced } from "@/features/system/useDebounced"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatDate } from "@/lib/format"
import { UserAvatar } from "./UserAvatar"
import { DeletedToggle } from "@/components/common/DeletedToggle"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"

const PAGE_SIZE = 20

// Mirrors AdminUserCreateSerializer (POST /admin/users/); role is always sent as "customer".
const CUSTOMER_IMPORT_FIELDS: ImportField[] = [
  { key: "email", label: "Email", required: true, example: "nusrat.jahan@example.com" },
  {
    key: "password",
    label: "Initial Password",
    required: true,
    aliases: ["password", "temporary password"],
    example: "set-a-unique-initial-password",
    resolve: (raw) => {
      if (raw.length < 8) throw new Error("Initial Password must be at least 8 characters")
      return raw
    },
  },
  { key: "first_name", label: "First Name", example: "Nusrat" },
  { key: "last_name", label: "Last Name", example: "Jahan" },
  { key: "phone", label: "Phone", example: "+8801812345678" },
  { key: "is_active", label: "Active", type: "boolean", aliases: ["status"], example: "yes" },
]

const statusOptions = [
  { label: "Active", value: "true" },
  { label: "Inactive", value: "false" },
]

const Customers = () => {
  useDocumentTitle("Customers")

  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { data: customers, isFetchingList, isMutating, error, totalItems, meta } = useAppSelector(
    (state) => state.customers
  )

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounced(search.trim())
  const [statusFilter, setStatusFilter] = useState<{ label: string; value: string } | null>(null)
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const loadCustomers = useCallback(
    () =>
      dispatch(
        fetchAll({
          page,
          page_size: PAGE_SIZE,
          role: "customer",
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(statusFilter ? { is_active: statusFilter.value } : {}),
          ...(includeDeleted ? { include_deleted: "true" } : {}),
        })
      ),
    [dispatch, page, debouncedSearch, statusFilter, includeDeleted]
  )

  useEffect(() => {
    const request = loadCustomers()
    return () => request.abort()
  }, [loadCustomers])

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const selectable = customers.filter((c) => c.is_active && !c.deleted_at)
  const allSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.id))

  const handleBulkDeactivate = async () => {
    const ids = Array.from(selected)
    if (!ids.length) return
    try {
      const result = await dispatch(bulkDeactivateUsers(ids)).unwrap()
      toast.success(`${result.affected} customer${result.affected === 1 ? "" : "s"} deactivated`)
      setSelected(new Set())
      loadCustomers()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't deactivate the selected customers"))
    }
  }

  const handleRestore = async (user: AdminUser) => {
    try {
      await dispatch(restoreUser(user.id)).unwrap()
      toast.success(`${displayNameOf(user)} restored`)
      loadCustomers()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't restore this customer"))
    }
  }

  const columns: ColumnDef<AdminUser>[] = [
    {
      id: "select",
      header: () => (
        <Checkbox
          aria-label="Select all active customers on this page"
          checked={allSelected}
          onCheckedChange={(checked) =>
            setSelected(checked ? new Set(selectable.map((c) => c.id)) : new Set())
          }
        />
      ),
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()} data-no-row-click="true">
          <Checkbox
            aria-label={`Select ${row.original.email}`}
            disabled={!row.original.is_active || !!row.original.deleted_at}
            checked={selected.has(row.original.id)}
            onCheckedChange={() => toggleRow(row.original.id)}
          />
        </div>
      ),
    },
    {
      id: "customer",
      header: "CUSTOMER",
      cell: ({ row }) => {
        const customer = row.original
        return (
          <div className="flex items-center gap-3">
            <UserAvatar user={customer} />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">{displayNameOf(customer)}</span>
              <span className="text-xs text-muted-foreground">{customer.email}</span>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "contact_phone",
      header: "PHONE",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.contact_phone || row.original.phone || "—"}</span>
      ),
    },
    {
      accessorKey: "date_joined",
      header: "JOINED",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDate(row.original.date_joined)}</span>,
    },
    {
      accessorKey: "is_active",
      header: "STATUS",
      cell: ({ row }) =>
        row.original.deleted_at ? (
          <StatusBadge status="deleted" tone="destructive" label="Deleted" />
        ) : (
          <StatusBadge status={row.original.is_active ? "active" : "inactive"} />
        ),
    },
    {
      id: "actions",
      header: "ACTION",
      cell: ({ row }) =>
        row.original.deleted_at ? (
          <Button
            variant="outline"
            size="sm"
            data-no-row-click="true"
            disabled={isMutating}
            onClick={(e) => {
              e.stopPropagation()
              handleRestore(row.original)
            }}
          >
            <RotateCcwIcon className="size-3.5" /> Restore
          </Button>
        ) : (
          <TableActions itemName={displayNameOf(row.original)} viewUrl={`/customer_detail/${row.original.id}`} />
        ),
    },
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Customers" description="Manage your registered customer accounts." />
        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <Button variant="destructive" size="action" onClick={handleBulkDeactivate} disabled={isMutating}>
              <BanIcon className="size-4" /> Deactivate {selected.size} selected
            </Button>
          )}
          <CsvImportButton
            entityName="customers"
            fields={CUSTOMER_IMPORT_FIELDS}
            createRow={(payload) =>
              dispatch(postData({ payload: { ...payload, role: "customer" } as Partial<AdminUser> })).unwrap()
            }
            onComplete={() => void loadCustomers()}
          />
        </div>
      </div>

      <FilterToolbar
        searchPlaceholder="Search by name, email or phone..."
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value)
          setPage(1)
        }}
        filters={[
          {
            component: (
              <ExampleComboboxCustomItems
                frameworks={statusOptions}
                placeholder="Status"
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value)
                  setPage(1)
                }}
              />
            ),
          },
          {
            component: (
              <DeletedToggle pressed={includeDeleted} onPressedChange={(checked) => {
                    setIncludeDeleted(checked)
                    setPage(1)
                  }} />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={customers}
        pageSize={PAGE_SIZE}
        isLoading={isFetchingList}
        error={error}
        onRetry={loadCustomers}
        manualPagination
        pageIndex={page - 1}
        pageCount={meta?.totalPages ?? 1}
        totalCount={totalItems}
        onPageChange={(index) => {
          setPage(index + 1)
          setSelected(new Set())
        }}
        onRowClick={(customer) => {
          if (!customer.deleted_at) navigate(`/customer_detail/${customer.id}`)
        }}
        unlabelledColumns={["select"]}
        emptyTitle="No customers found"
        emptyDescription="No customer accounts match these filters."
        minWidth="900px"
        columnWidths={["48px", "300px", "160px", "130px", "120px", "90px"]}
      />
    </div>
  )
}

export default Customers
