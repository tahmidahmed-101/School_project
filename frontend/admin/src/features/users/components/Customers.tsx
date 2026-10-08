import { useState } from "react"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { Combobox } from "@/components/common/ComboBox"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { TableActions } from "@/components/common/TableActions"
import { PageHeader } from "@/components/common/PageHeader"
import { ActiveStatusBadge, DateCell, TextCell } from "@/components/common/cells"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { bulkDeactivateUsers, fetchAll, postData, restoreUser, activateUser } from "@/features/users/slices/customerSlice"
import { customerDetailPath } from "@/features/users/paths"
import { displayNameOf, type AdminUser } from "@/features/users/types"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useKind } from "@/hooks/use-kind"
import { useListPage } from "@/hooks/use-list-page"
import type { Option } from "@/lib/types"
import { UserAvatar } from "./UserAvatar"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { Button } from "@/components/ui/button"
import { RestoreDeletedButton } from "@/components/common/RestoreDeletedButton"
import { PlusIcon } from "lucide-react"
import { CustomerFormDialog } from "./CustomerDialogs"

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

const statusOptions: Option[] = [
  { label: "Active", value: "true" },
  { label: "Inactive", value: "false" },
]

const Customers = () => {
  const kind = useKind()
  const isPreorder = kind === "preorder"
  const title = isPreorder ? "Pre-order customers" : "Customers"
  useDocumentTitle(title)

  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const customerState = useAppSelector((state) => state.customers)
  const { data: customers } = customerState

  const [statusFilter, setStatusFilter] = useState<Option | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const list = useListPage({
    fetch: (params) => dispatch(fetchAll(params)),
    state: customerState,
    params: { role: "customer", kind, is_active: statusFilter?.value },
  })

  const columns: ColumnDef<AdminUser>[] = [
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
      cell: ({ row }) => <TextCell muted value={row.original.contact_phone || row.original.phone} />,
    },
    {
      accessorKey: "date_joined",
      header: "JOINED",
      cell: ({ row }) => <DateCell value={row.original.date_joined} className="text-muted-foreground" />,
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
          viewUrl={customerDetailPath(kind, row.original.id)}
        />
      ),
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title={title}
        description={isPreorder ? "People who have placed a pre-order." : undefined}
        actions={
          // A new customer has no pre-order yet, so adding and importing live on the Customers page.
          !isPreorder && (
            <>
              <RestoreDeletedButton<AdminUser>
                noun="customers"
                endpoint="/admin/users/"
                params={{ role: "customer", kind }}
                restore={(item) => dispatch(restoreUser(item.id)).unwrap()}
                label={(item) => displayNameOf(item)}
                sub={(item) => item.email}
                onRestored={list.reload}
              />
              <CsvImportButton
                entityName="customers"
                fields={CUSTOMER_IMPORT_FIELDS}
                createRow={(payload) =>
                  dispatch(postData({ payload: { ...payload, role: "customer" } as Partial<AdminUser> })).unwrap()
                }
                onComplete={list.reload}
              />
              <Button size="action" onClick={() => setAddOpen(true)}>
                <PlusIcon className="size-5" /> Add Customer
              </Button>
            </>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search by name, email or phone..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[
          {
            component: (
              <Combobox
                options={statusOptions}
                placeholder="Status"
                value={statusFilter}
                onValueChange={setStatusFilter}
              />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        bulk={{
          noun: "customer",
          activate: (rows) => Promise.all(rows.map((c) => dispatch(activateUser(c.id)).unwrap())),
          deactivate: (rows) => dispatch(bulkDeactivateUsers(rows.map((c) => c.id))).unwrap(),
          onDone: list.reload,
        }}
        data={customers}
        {...list.tableProps}
        onRowClick={(customer) => {
          if (!customer.deleted_at) navigate(customerDetailPath(kind, customer.id))
        }}
        emptyTitle="No customers found"
        emptyDescription={
          isPreorder ? "No one with a pre-order matches these filters." : "No customer accounts match these filters."
        }
        minWidth="900px"
        columnWidths={["300px", "160px", "130px", "120px", "80px"]}
      />
      <CustomerFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={(created) => navigate(customerDetailPath(kind, created.id))}
      />
    </div>
  )
}

export default Customers
