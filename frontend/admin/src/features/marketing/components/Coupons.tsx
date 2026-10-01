import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { PlusIcon, RotateCcwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableActions } from "@/components/common/TableActions"
import FilterToolbar from "@/components/common/FilterToolBar"
import { DataTable } from "@/components/common/data-table"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeading } from "@/components/common/PageHeading"
import type { Coupon } from "@/features/marketing/types"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { deleteData, fetchAll, patchData, postData, restoreCoupon } from "@/features/marketing/slices/couponSlice"
import { useCan } from "@/features/system/permissions"
import { useDebounced } from "@/features/system/useDebounced"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency, formatDate } from "@/lib/format"
import { DeletedToggle } from "@/components/common/DeletedToggle"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"

const PAGE_SIZE = 20

/** "YYYY-MM-DD" (end of that day) or "YYYY-MM-DD HH:mm", in local time → ISO string. */
function parseImportDateTime(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(raw.trim())
  if (!m) throw new Error(`"${raw}" is not a date like 2026-12-31 or 2026-12-31 23:59`)
  const [, y, mo, d, h, mi] = m
  const date = h
    ? new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi))
    : new Date(Number(y), Number(mo) - 1, Number(d), 23, 59, 59)
  if (Number.isNaN(date.getTime()) || date.getMonth() !== Number(mo) - 1) throw new Error(`"${raw}" is not a valid date`)
  return date.toISOString()
}

// Mirrors CouponCreateSerializer (POST /admin/coupons/) plus is_active, which — like the
// coupon form — is applied with a follow-up PATCH because create has no is_active field.
const COUPON_IMPORT_FIELDS: ImportField[] = [
  {
    key: "code",
    label: "Code",
    required: true,
    example: "EID25",
    resolve: (raw) => {
      const code = raw.trim().toUpperCase()
      if (code.length > 32) throw new Error("Code must be 32 characters or fewer")
      return code
    },
  },
  { key: "value", label: "Value", required: true, type: "number", aliases: ["discount", "amount"], example: "10" },
  {
    key: "discount_type",
    label: "Discount Type",
    type: "enum",
    options: ["percentage", "fixed"],
    aliases: ["type"],
    example: "percentage",
  },
  {
    key: "min_order_amount",
    label: "Min Order Amount (BDT)",
    type: "number",
    aliases: ["min order amount", "minimum order"],
    example: "1000",
  },
  { key: "usage_limit", label: "Usage Limit", type: "integer", example: "500" },
  {
    key: "expires_at",
    label: "Expires At",
    aliases: ["expires", "expiry"],
    example: "2026-12-31 23:59",
    resolve: parseImportDateTime,
  },
  { key: "is_active", label: "Active", type: "boolean", aliases: ["status"], example: "yes" },
]

const ORDERING_OPTIONS = [
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
  const can = useCan()
  const canManage = can("orders.manage")
  const { data: coupons, isFetchingList, isMutating, error, totalItems, meta } = useAppSelector(
    (state) => state.coupons
  )

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounced(search.trim())
  const [ordering, setOrdering] = useState("-created_at")
  const [includeDeleted, setIncludeDeleted] = useState(false)

  const loadCoupons = useCallback(
    () =>
      dispatch(
        fetchAll({
          page,
          page_size: PAGE_SIZE,
          ordering,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(includeDeleted ? { include_deleted: "true" } : {}),
        })
      ),
    [dispatch, page, ordering, debouncedSearch, includeDeleted]
  )

  useEffect(() => {
    const request = loadCoupons()
    return () => request.abort()
  }, [loadCoupons])

  const handleDelete = async (coupon: Coupon) => {
    try {
      await dispatch(deleteData(coupon.id)).unwrap()
      toast.success(`Coupon ${coupon.code} deleted`)
      if (includeDeleted) loadCoupons()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't delete this coupon"))
    }
  }

  const handleRestore = async (coupon: Coupon) => {
    try {
      await dispatch(restoreCoupon(coupon.id)).unwrap()
      toast.success(`Coupon ${coupon.code} restored`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't restore this coupon"))
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
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(row.original.expires_at, "Never")}</span>
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
      header: "ACTION",
      cell: ({ row }) =>
        row.original.deleted_at ? (
          canManage ? (
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
          ) : null
        ) : (
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
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Coupons" description="Discount codes customers can apply at checkout." />
        {canManage && (
          <div className="flex items-center gap-3">
            <CsvImportButton
              entityName="coupons"
              fields={COUPON_IMPORT_FIELDS}
              createRow={async ({ is_active, ...payload }) => {
                const created = await dispatch(postData({ payload: payload as Partial<Coupon> })).unwrap()
                // New coupons start active; deactivate afterwards, as the coupon form does.
                if (is_active === false) {
                  await dispatch(patchData({ id: created.id, payload: { is_active: false } })).unwrap()
                }
                return created
              }}
              onComplete={() => void loadCoupons()}
            />
            <Button variant="apply" size="action" onClick={() => navigate("/coupon_form/new")}>
              <PlusIcon className="size-5" /> Add Coupon
            </Button>
          </div>
        )}
      </div>

      <FilterToolbar
        searchPlaceholder="Search by code..."
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
                <SelectTrigger className="w-[180px]" aria-label="Sort coupons">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDERING_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ),
          },
          ...(canManage
            ? [
                {
                  component: (
                    <DeletedToggle pressed={includeDeleted} onPressedChange={(checked) => {
                          setIncludeDeleted(checked)
                          setPage(1)
                        }} />
                  ),
                },
              ]
            : []),
        ]}
      />

      <DataTable
        columns={columns}
        data={coupons}
        pageSize={PAGE_SIZE}
        isLoading={isFetchingList}
        error={error}
        onRetry={loadCoupons}
        manualPagination
        pageIndex={page - 1}
        pageCount={meta?.totalPages ?? 1}
        totalCount={totalItems}
        onPageChange={(index) => setPage(index + 1)}
        onRowClick={(coupon) => {
          if (!coupon.deleted_at) navigate(`/coupon_form/${coupon.id}`)
        }}
        emptyTitle="No coupons yet"
        emptyDescription="Create a discount code to reward customers or run a promotion."
        {...(canManage ? { emptyActionLabel: "Add Coupon", onEmptyAction: () => navigate("/coupon_form/new") } : {})}
        minWidth="960px"
        columnWidths={["160px", "140px", "130px", "100px", "140px", "110px", "110px"]}
      />
    </div>
  )
}

export default Coupons
