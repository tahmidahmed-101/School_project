import { useState } from "react"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TableActions } from "@/components/common/TableActions"
import FilterToolbar from "@/components/common/FilterToolBar"
import { DataTable } from "@/components/common/data-table"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeader } from "@/components/common/PageHeader"
import { SortSelect } from "@/components/common/SortSelect"
import { DateCell } from "@/components/common/cells"
import { RestoreDeletedButton } from "@/components/common/RestoreDeletedButton"
import type { Coupon } from "@/features/marketing/types"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { deleteData, fetchAll, restoreCoupon } from "@/features/marketing/slices/couponSlice"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency } from "@/lib/format"
import type { Option } from "@/lib/types"

const ORDERING_OPTIONS: Option[] = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "code", label: "Code A–Z" },
  { value: "expires_at", label: "Expiring soonest" },
]

const formatCouponValue = (coupon: Pick<Coupon, "discount_type" | "value">) =>
  coupon.discount_type === "percentage" ? `${Number(coupon.value)}%` : formatCurrency(coupon.value)

function couponState(coupon: Coupon): { status: string; tone: "success" | "destructive" | "secondary" | "warning"; label: string } {
  if (coupon.deleted_at) return { status: "deleted", tone: "destructive", label: "Deleted" }
  if (!coupon.is_active) return { status: "inactive", tone: "secondary", label: "Inactive" }
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now())
    return { status: "expired", tone: "destructive", label: "Expired" }
  if (coupon.usage_limit != null && coupon.times_used >= coupon.usage_limit)
    return { status: "used_up", tone: "warning", label: "Used up" }
  return { status: "active", tone: "success", label: "Active" }
}

const Coupons = () => {
  useDocumentTitle("Coupons")

  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = useCan("orders.manage")
  const couponSlice = useAppSelector((state) => state.coupons)
  const coupons = couponSlice.data

  const [ordering, setOrdering] = useState<Option | null>(ORDERING_OPTIONS[0])

  const list = useListPage({
    fetch: (params) => dispatch(fetchAll(params)),
    state: couponSlice,
    params: { ordering: ordering?.value ?? ORDERING_OPTIONS[0].value },
  })

  const handleDelete = async (coupon: Coupon) => {
    try {
      await dispatch(deleteData(coupon.id)).unwrap()
      toast.success(`Coupon ${coupon.code} deleted`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't delete this coupon"))
    }
  }


  const columns: ColumnDef<Coupon>[] = [
    {
      accessorKey: "code",
      header: "CODE",
      cell: ({ row }) => <span className="font-mono text-sm font-semibold text-primary">{row.original.code}</span>,
    },
    {
      id: "discount",
      header: "DISCOUNT",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{formatCouponValue(row.original)}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.discount_type === "percentage" ? "Percentage" : "Fixed amount"}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "min_order_amount",
      header: "MIN. ORDER",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {Number(row.original.min_order_amount) > 0 ? formatCurrency(row.original.min_order_amount) : "—"}
        </span>
      ),
    },
    {
      id: "usage",
      header: "USED",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.times_used}
          <span className="text-muted-foreground"> / {row.original.usage_limit ?? "∞"}</span>
        </span>
      ),
    },
    {
      accessorKey: "expires_at",
      header: "EXPIRES",
      cell: ({ row }) =>
        row.original.expires_at ? (
          <DateCell value={row.original.expires_at} className="text-muted-foreground" />
        ) : (
          <span className="text-sm text-muted-foreground">Never</span>
        ),
    },
    {
      id: "status",
      header: "STATUS",
      cell: ({ row }) => {
        const state = couponState(row.original)
        return <StatusBadge status={state.status} tone={state.tone} label={state.label} />
      },
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => (
        <TableActions
          itemName={row.original.code}
          {...(canManage
            ? { editUrl: `/coupon_form/${row.original.id}`, onDelete: () => handleDelete(row.original) }
            : { viewUrl: `/coupon_form/${row.original.id}` })}
        />
      ),
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Coupons"
        actions={
          canManage && (
            <>
              <RestoreDeletedButton<Coupon>
                noun="coupons"
                endpoint="/admin/coupons/"
                restore={(item) => dispatch(restoreCoupon(item.id)).unwrap()}
                label={(item) => item.code}
                onRestored={list.reload}
              />
              <Button variant="apply" size="action" onClick={() => navigate("/coupon_form/new")}>
                <PlusIcon className="size-5" /> Add Coupon
              </Button>
            </>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search by code..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[
          { component: <SortSelect options={ORDERING_OPTIONS} value={ordering} onChange={setOrdering} /> },
        ]}
      />

      <DataTable
        columns={columns}
        bulk={
          canManage
            ? { noun: "coupon", deleteRow: (c) => dispatch(deleteData(c.id)).unwrap(), onDone: list.reload }
            : undefined
        }
        data={coupons}
        {...list.tableProps}
        onRowClick={(coupon) => {
          if (!coupon.deleted_at) navigate(`/coupon_form/${coupon.id}`)
        }}
        emptyTitle="No coupons yet"
        emptyDescription="Create a discount code to reward customers or run a promotion."
        {...(canManage ? { emptyActionLabel: "Add Coupon", onEmptyAction: () => navigate("/coupon_form/new") } : {})}
        minWidth="960px"
        columnWidths={["160px", "140px", "130px", "100px", "140px", "110px", "80px"]}
      />
    </div>
  )
}

export default Coupons
