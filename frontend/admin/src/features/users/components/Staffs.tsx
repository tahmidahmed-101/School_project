import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { TableActions } from "@/components/common/TableActions"
import { PageHeader } from "@/components/common/PageHeader"
import { ActiveStatusBadge, TextCell } from "@/components/common/cells"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { deleteData, fetchAll, restoreStaff } from "@/features/users/slices/staffSlice"
import { displayNameOf, type AdminUser } from "@/features/users/types"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import { isFullAccess } from "@/hooks/use-can"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatDateTime } from "@/lib/format"
import { UserAvatar } from "./UserAvatar"
import { DeletedToggle } from "@/components/common/DeletedToggle"

const Staffs = () => {
  useDocumentTitle("Staff")

  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const staffState = useAppSelector((state) => state.staffs)
  const staffs = staffState.data

  const list = useListPage({
    fetch: (params) => dispatch(fetchAll(params)),
    state: staffState,
  })

  const handleDelete = async (staff: AdminUser) => {
    try {
      await dispatch(deleteData(staff.id)).unwrap()
      toast.success(`${displayNameOf(staff)} removed`)
      if (list.includeDeleted) list.reload()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't remove this staff member"))
    }
  }

  const handleRestore = async (staff: AdminUser) => {
    try {
      await dispatch(restoreStaff(staff.id)).unwrap()
      toast.success(`${displayNameOf(staff)} restored`)
      list.reload()
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
      cell: ({ row }) => <TextCell muted value={row.original.phone} />,
    },
    {
      id: "permissions",
      header: "PERMISSIONS",
      cell: ({ row }) => {
        const perms = row.original.permissions
        return (
          <TextCell muted value={isFullAccess(perms) ? "All" : perms.length ? `${perms.length} granted` : "None"} />
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
      cell: ({ row }) => <ActiveStatusBadge deleted={row.original.deleted_at} active={row.original.is_active} />,
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => (
        <TableActions
          itemName={displayNameOf(row.original)}
          editUrl={`/staff_form/${row.original.id}`}
          onDelete={() => handleDelete(row.original)}
          deleted={!!row.original.deleted_at}
          onRestore={() => handleRestore(row.original)}
        />
      ),
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Staff Members"
        description="Manage your team members and what they can access."
        actions={
          <Button variant="apply" size="action" onClick={() => navigate("/staff_form/new")}>
            <PlusIcon className="size-5" /> Add Staff
          </Button>
        }
      />

      <FilterToolbar
        searchPlaceholder="Search by name, email or phone..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[
          {
            component: <DeletedToggle pressed={list.includeDeleted} onPressedChange={list.setIncludeDeleted} />,
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={staffs}
        {...list.tableProps}
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
