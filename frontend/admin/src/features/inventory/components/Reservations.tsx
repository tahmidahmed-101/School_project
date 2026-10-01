import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { Lock, Unlock } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { DataTable } from "@/components/common/data-table"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeading } from "@/components/common/PageHeading"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatDateTime } from "@/lib/format"
import { usePermission } from "@/features/catalog/lib/usePermission"
import { VariantPicker, type PickedVariant } from "@/features/catalog/components/VariantPicker"

import { fetchAll } from "../slices/reservationSlice"
import { releaseReservation } from "../api"
import type { StockReservation } from "../types"

type Option = { label: string; value: string }
const PAGE_SIZE = 25

const statusOptions: Option[] = [
  { label: "Active", value: "active" },
  { label: "Released", value: "released" },
]
const expiryOptions: Option[] = [
  { label: "Expired (still held)", value: "true" },
  { label: "Not expired", value: "false" },
]
const orderingOptions: Option[] = [
  { label: "Newest first", value: "-created_at" },
  { label: "Expiring soonest", value: "expires_at" },
  { label: "Largest quantity", value: "-quantity" },
]

const Reservations = () => {
  useDocumentTitle("Stock Reservations")
  const dispatch = useAppDispatch()
  // Reservations live in the orders app: list needs orders.view, release needs orders.manage.
  const canRelease = usePermission("orders.manage")
  const { data: reservations, isFetchingList, error, totalItems } = useAppSelector((s) => s.stockReservations)

  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<Option | null>(statusOptions[0])
  const [expired, setExpired] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(null)
  const [variant, setVariant] = useState<PickedVariant | null>(null)
  const [createdBefore, setCreatedBefore] = useState("")

  const params = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      ...(status ? { status: status.value } : {}),
      ...(expired ? { expired: expired.value } : {}),
      ...(ordering ? { ordering: ordering.value } : {}),
      ...(variant ? { variant_id: variant.id } : {}),
      ...(createdBefore ? { created_before: createdBefore } : {}),
    }),
    [page, status, expired, ordering, variant, createdBefore]
  )
  const load = useCallback(() => {
    dispatch(fetchAll(params))
  }, [dispatch, params])
  useEffect(() => {
    load()
  }, [load])

  const release = async (r: StockReservation) => {
    try {
      await releaseReservation(r.id)
      toast.success(`Released ${r.quantity} × ${r.variant_sku}`)
      load()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to release reservation"))
    }
  }

  const columns: ColumnDef<StockReservation>[] = [
    {
      id: "item",
      header: "ITEM",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{row.original.product_name}</div>
          <div className="truncate font-mono text-xs text-muted-foreground">{row.original.variant_sku}</div>
        </div>
      ),
    },
    {
      id: "order",
      header: "ORDER",
      cell: ({ row }) => (
        <Link to={`/order_detail/${row.original.order_id}`} className="text-sm text-primary hover:underline">
          {row.original.order_number}
        </Link>
      ),
    },
    { accessorKey: "quantity", header: "QTY" },
    {
      id: "status",
      header: "STATUS",
      cell: ({ row }) =>
        row.original.status === "active" && row.original.is_expired ? (
          <StatusBadge status="expired" label="Active · expired" />
        ) : (
          <StatusBadge status={row.original.status} />
        ),
    },
    {
      accessorKey: "created_at",
      header: "RESERVED",
      cell: ({ row }) => <span className="text-sm whitespace-nowrap">{formatDateTime(row.original.created_at)}</span>,
    },
    {
      accessorKey: "expires_at",
      header: "EXPIRES",
      cell: ({ row }) => (
        <span className={`text-sm whitespace-nowrap ${row.original.is_expired ? "text-destructive" : ""}`}>
          {formatDateTime(row.original.expires_at)}
        </span>
      ),
    },
    ...(canRelease
      ? [
          {
            id: "actions",
            header: "ACTION",
            cell: ({ row }: { row: { original: StockReservation } }) =>
              row.original.status === "active" ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Unlock /> Release
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Release reservation?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {row.original.quantity} × {row.original.variant_sku} held for order {row.original.order_number}{" "}
                        returns to sellable stock.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void release(row.original)}>Release</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null,
          } as ColumnDef<StockReservation>,
        ]
      : []),
  ]

  return (
    <div className="section-container">
      <PageHeading title="Stock Reservations" description="Stock held for placed orders until they ship or the hold expires" />

      <FilterToolbar
        inlineCount={3}
        filters={[
          {
            wide: true,
            active: Boolean(variant),
            component: (
              <VariantPicker value={variant} onChange={(v) => { setVariant(v); setPage(1) }} placeholder="Filter by variant…" />
            ),
          },
          {
            active: Boolean(status),
            component: (
              <ExampleComboboxCustomItems
                placeholder="Status"
                frameworks={statusOptions}
                value={status}
                onValueChange={(v) => {
                  setStatus(v)
                  setPage(1)
                }}
              />
            ),
          },
          {
            active: Boolean(expired),
            component: (
              <ExampleComboboxCustomItems
                placeholder="Expiry"
                frameworks={expiryOptions}
                value={expired}
                onValueChange={(v) => {
                  setExpired(v)
                  setPage(1)
                }}
              />
            ),
          },
          {
            active: Boolean(ordering),
            component: (
              <ExampleComboboxCustomItems
                placeholder="Sort"
                frameworks={orderingOptions}
                value={ordering}
                onValueChange={(v) => {
                  setOrdering(v)
                  setPage(1)
                }}
              />
            ),
          },
          {
            active: Boolean(createdBefore),
            component: (
              <Input
                type="date"
                aria-label="Created before"
                title="Created before"
                className="h-9"
                value={createdBefore}
                onChange={(e) => {
                  setCreatedBefore(e.target.value)
                  setPage(1)
                }}
              />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={reservations}
        isLoading={isFetchingList}
        error={error}
        onRetry={load}
        manualPagination
        pageSize={PAGE_SIZE}
        pageIndex={page - 1}
        pageCount={Math.max(1, Math.ceil(totalItems / PAGE_SIZE))}
        totalCount={totalItems}
        onPageChange={(i) => setPage(i + 1)}
        emptyIcon={Lock}
        emptyTitle="No reservations"
        emptyDescription="No stock holds match these filters."
        minWidth="980px"
        columnWidths={["240px", "140px", "70px", "150px", "170px", "170px", ...(canRelease ? ["120px"] : [])]}
        unlabelledColumns={["actions"]}
      />
    </div>
  )
}

export default Reservations
