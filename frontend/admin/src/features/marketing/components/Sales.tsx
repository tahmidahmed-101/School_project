import { useState } from "react"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TableActions } from "@/components/common/TableActions"
import FilterToolbar from "@/components/common/FilterToolBar"
import { Combobox } from "@/components/common/ComboBox"
import { DataTable } from "@/components/common/data-table"
import { StatusBadge } from "@/components/common/StatusBadge"
import type { StatusTone } from "@/components/common/status-tones"
import { PageHeader } from "@/components/common/PageHeader"
import { DateCell } from "@/components/common/cells"
import type { Sale, SaleStatus } from "@/features/marketing/types"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { deleteData, fetchAll } from "@/features/marketing/slices/saleSlice"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import { getApiErrorMessage } from "@/lib/api/client"
import type { Option } from "@/lib/types"

const STATUS_OPTIONS: Option[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "running", label: "Running" },
  { value: "ended", label: "Ended" },
  { value: "off", label: "Off" },
]

const STATUS_TONES: Record<SaleStatus, StatusTone> = {
  scheduled: "info",
  running: "success",
  ended: "destructive",
  off: "secondary",
}

const counted = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

function appliesToLabel(sale: Sale) {
  if (sale.applies_to === "categories") return counted(sale.categories.length, "category", "categories")
  if (sale.applies_to === "brands") return counted(sale.brands.length, "brand", "brands")
  if (sale.applies_to === "products") return counted(sale.products.length, "product", "products")
  return "All stock"
}

const Sales = () => {
  useDocumentTitle("Sales")

  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = useCan("orders.manage")
  const saleSlice = useAppSelector((state) => state.sales)
  const sales = saleSlice.data

  const [status, setStatus] = useState<Option | null>(null)

  const list = useListPage({
    fetch: (params) => dispatch(fetchAll(params)),
    state: saleSlice,
    params: { status: status?.value },
  })

  const handleDelete = async (sale: Sale) => {
    try {
      await dispatch(deleteData(sale.id)).unwrap()
      toast.success(`Sale ${sale.name} deleted`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't delete this sale"))
    }
  }

  const columns: ColumnDef<Sale>[] = [
    {
      accessorKey: "name",
      header: "NAME",
      cell: ({ row }) => <span className="text-sm font-semibold text-primary">{row.original.name}</span>,
    },
    {
      accessorKey: "percent_off",
      header: "DISCOUNT",
      cell: ({ row }) => <span className="text-sm font-semibold">{Number(row.original.percent_off)}% off</span>,
    },
    {
      id: "applies_to",
      header: "APPLIES TO",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{appliesToLabel(row.original)}</span>,
    },
    {
      accessorKey: "starts_at",
      header: "STARTS",
      cell: ({ row }) => <DateCell value={row.original.starts_at} withTime className="text-muted-foreground" />,
    },
    {
      accessorKey: "ends_at",
      header: "ENDS",
      cell: ({ row }) =>
        row.original.ends_at ? (
          <DateCell value={row.original.ends_at} withTime className="text-muted-foreground" />
        ) : (
          <span className="text-sm text-muted-foreground">Until switched off</span>
        ),
    },
    {
      id: "status",
      header: "STATUS",
      cell: ({ row }) => <StatusBadge status={row.original.status} tone={STATUS_TONES[row.original.status]} />,
    },
    {
      accessorKey: "is_active",
      header: "ON/OFF",
      cell: ({ row }) => <span className="text-sm">{row.original.is_active ? "On" : "Off"}</span>,
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => (
        <TableActions
          itemName={row.original.name}
          {...(canManage
            ? { editUrl: `/sale_form/${row.original.id}`, onDelete: () => handleDelete(row.original) }
            : { viewUrl: `/sale_form/${row.original.id}` })}
        />
      ),
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Sales"
        actions={
          canManage && (
            <Button variant="apply" size="action" onClick={() => navigate("/sale_form/new")}>
              <PlusIcon className="size-5" /> Add Sale
            </Button>
          )
        }
      />

      <FilterToolbar
        filters={[
          {
            active: Boolean(status),
            component: (
              <Combobox placeholder="Status" options={STATUS_OPTIONS} value={status} onValueChange={setStatus} />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        bulk={
          canManage
            ? { noun: "sale", deleteRow: (s) => dispatch(deleteData(s.id)).unwrap(), onDone: list.reload }
            : undefined
        }
        data={sales}
        {...list.tableProps}
        onRowClick={(sale) => navigate(`/sale_form/${sale.id}`)}
        emptyTitle="No sales yet"
        emptyDescription="Create a sale to take a percentage off items in stock for a set period."
        {...(canManage ? { emptyActionLabel: "Add Sale", onEmptyAction: () => navigate("/sale_form/new") } : {})}
        minWidth="1080px"
        columnWidths={["200px", "110px", "140px", "160px", "160px", "110px", "90px", "80px"]}
      />
    </div>
  )
}

export default Sales
