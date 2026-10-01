import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { PlusIcon, RotateCcwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { TableActions } from "@/components/common/TableActions"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeading } from "@/components/common/PageHeading"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { deleteData, fetchAll, postData, restoreStaff } from "@/features/users/slices/staffSlice"
import { displayNameOf, type AdminUser } from "@/features/users/types"
import { useDebounced } from "@/features/system/useDebounced"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatDateTime } from "@/lib/format"
import { UserAvatar } from "./UserAvatar"
import { DeletedToggle } from "@/components/common/DeletedToggle"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"

const PAGE_SIZE = 20

// Mirrors StaffCreateSerializer (POST /admin/staff/).
const STAFF_IMPORT_FIELDS: ImportField[] = [
  { key: "email", label: "Email", required: true, example: "rahim.uddin@example.com" },
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
  { key: "first_name", label: "First Name", example: "Rahim" },
  { key: "last_name", label: "Last Name", example: "Uddin" },
  { key: "phone", label: "Phone", example: "+8801712345678" },
  {
    key: "permissions",
    label: "Permissions",
    aliases: ["permission codes"],
    example: "orders.view;catalog.view",
    // Permission codes separated by ";" or "|"; the backend rejects unknown codes.
    resolve: (raw) =>
      raw
        .split(/[;|,]/)
        .map((code) => code.trim())
        .filter(Boolean),
  },
]

const Staffs = () => {
  useDocumentTitle("Staff")

  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { data: staffs, isFetchingList, isMutating, error, totalItems, meta } = useAppSelector(
    (state) => state.staffs
  )

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounced(search.trim())
  const [includeDeleted, setIncludeDeleted] = useState(false)

  const loadStaffs = useCallback(
    () =>
      dispatch(
        fetchAll({
          page,
          page_size: PAGE_SIZE,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(includeDeleted ? { include_deleted: "true" } : {}),
        })
      ),
    [dispatch, page, debouncedSearch, includeDeleted]
  )

  useEffect(() => {
    const request = loadStaffs()
    return () => request.abort()
  }, [loadStaffs])

  const handleDelete = async (staff: AdminUser) => {
    try {
      await dispatch(deleteData(staff.id)).unwrap()
      toast.success(`${displayNameOf(staff)} removed`)
      if (includeDeleted) loadStaffs()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't remove this staff member"))
    }
  }

  const handleRestore = async (staff: AdminUser) => {
    try {
      await dispatch(restoreStaff(staff.id)).unwrap()
      toast.success(`${displayNameOf(staff)} restored`)
      loadStaffs()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't restore this staff member"))
    }
  }

  const columns: ColumnDef<AdminUser>[] = [
    {
      id: "staff",
      header: "STAFF",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <UserAvatar user={row.original} />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">{displayNameOf(row.original)}</span>
            <span className="text-xs text-muted-foreground">{row.original.email}</span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "phone",
      header: "PHONE",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.phone || "—"}</span>,
    },
    {
      id: "permissions",
      header: "PERMISSIONS",
      cell: ({ row }) => {
        const perms = row.original.permissions
        return (
          <span className="text-sm text-muted-foreground">
            {perms.includes("*") ? "All" : perms.length ? `${perms.length} granted` : "None"}
          </span>
        )
      },
    },
    {
      accessorKey: "last_login",
      header: "LAST SIGN-IN",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDateTime(row.original.last_login, "Never")}
        </span>
      ),
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
          <TableActions
            itemName={displayNameOf(row.original)}
            editUrl={`/staff_form/${row.original.id}`}
            onDelete={() => handleDelete(row.original)}
          />
        ),
    },
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Staff Members" description="Manage your team members and what they can access." />
        <div className="flex items-center gap-3">
          <CsvImportButton
            entityName="staff members"
            fields={STAFF_IMPORT_FIELDS}
            createRow={(payload) => dispatch(postData({ payload: payload as Partial<AdminUser> })).unwrap()}
            onComplete={() => void loadStaffs()}
          />
          <Button variant="apply" size="action" onClick={() => navigate("/staff_form/new")}>
            <PlusIcon className="size-5" /> Add Staff
          </Button>
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
        data={staffs}
        pageSize={PAGE_SIZE}
        isLoading={isFetchingList}
        error={error}
        onRetry={loadStaffs}
        manualPagination
        pageIndex={page - 1}
        pageCount={meta?.totalPages ?? 1}
        totalCount={totalItems}
        onPageChange={(index) => setPage(index + 1)}
        onRowClick={(staff) => {
          if (!staff.deleted_at) navigate(`/staff_form/${staff.id}`)
        }}
        emptyTitle="No staff members"
        emptyDescription="Add a team member to give them access to the dashboard."
        emptyActionLabel="Add Staff"
        onEmptyAction={() => navigate("/staff_form/new")}
        minWidth="960px"
        columnWidths={["300px", "150px", "130px", "180px", "110px", "110px"]}
      />
    </div>
  )
}

export default Staffs
