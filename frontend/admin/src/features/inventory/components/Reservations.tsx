import { useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { Lock, Unlock } from "lucide-react"

import { Input } from "@/components/ui/input"
import { DataTable } from "@/components/common/data-table"
import { Combobox } from "@/components/common/ComboBox"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { SortSelect } from "@/components/common/SortSelect"
import { StatusBadge } from "@/components/common/StatusBadge"
import { DateCell, LinkCell, ProductCell } from "@/components/common/cells"
import { TableActions } from "@/components/common/TableActions"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import { getApiErrorMessage } from "@/lib/api/client"
import type { Option } from "@/lib/types"
import { VariantPicker, type PickedVariant } from "@/components/common/VariantPicker"

import { fetchAll } from "../slices/reservationSlice"
import { releaseReservation } from "../api"
import type { StockReservation } from "../types"

const PAGE_SIZE = 25
const STOCK_VARIANTS = { category_type: "stock" }

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
  const canRelease = useCan("orders.manage")
  const reservationState = useAppSelector((s) => s.stockReservations)

  const [status, setStatus] = useState<Option | null>(statusOptions[0])
  const [expired, setExpired] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(null)
  const [variant, setVariant] = useState<PickedVariant | null>(null)
  const [createdBefore, setCreatedBefore] = useState("")
  const [releasing, setReleasing] = useState<StockReservation | null>(null)

  const list = useListPage({
    fetch: (p) => dispatch(fetchAll(p)),
    state: reservationState,
    pageSize: PAGE_SIZE,
    params: {
      kind: "stock",
      status: status?.value,
      expired: expired?.value,
      ordering: ordering?.value,
      variant_id: variant?.id,
      created_before: createdBefore,
    },
  })

  const release = async (r: StockReservation) => {
    try {
      await releaseReservation(r.id)
      toast.success(`Released ${r.quantity} × ${r.variant_sku}`)
      list.reload()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to release reservation"))
    }
  }

  const columns: ColumnDef<StockReservation>[] = [
    {
      id: "item",
      header: "ITEM",
      cell: ({ row }) => <ProductCell name={row.original.product_name} sku={row.original.variant_sku} />,
    },
    {
      id: "order",
      header: "ORDER",
      cell: ({ row }) => (
        <LinkCell to={`/order_detail/${row.original.order_id}`}>{row.original.order_number}</LinkCell>
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
      cell: ({ row }) => <DateCell value={row.original.created_at} withTime />,
    },
    {
      accessorKey: "expires_at",
      header: "EXPIRES",
      cell: ({ row }) => (
        <DateCell value={row.original.expires_at} withTime className={row.original.is_expired ? "text-destructive" : undefined} />
      ),
    },
    ...(canRelease
      ? [
          {
            id: "actions",
            header: "ACTIONS",
            cell: ({ row }: { row: { original: StockReservation } }) =>
              row.original.status === "active" ? (
                <TableActions
                  itemName={`reservation for ${row.original.variant_sku}`}
                  actions={[{ label: "Release", icon: Unlock, onSelect: () => setReleasing(row.original) }]}
                />
              ) : null,
          } as ColumnDef<StockReservation>,
        ]
      : []),
  ]

  return (
    <div className="section-container">
      <PageHeader title="Stock Reservations" />

      <FilterToolbar
        inlineCount={3}
        filters={[
          {
            wide: true,
            active: Boolean(variant),
            component: (
              <VariantPicker
                value={variant}
                onChange={setVariant}
                placeholder="Filter by variant…"
                filters={STOCK_VARIANTS}
              />
            ),
          },
          {
            active: Boolean(status),
            component: (
              <Combobox
                placeholder="Status"
                options={statusOptions}
                value={status}
                onValueChange={setStatus}
              />
            ),
          },
          {
            active: Boolean(expired),
            component: (
              <Combobox
                placeholder="Expiry"
                options={expiryOptions}
                value={expired}
                onValueChange={setExpired}
              />
            ),
          },
          {
            active: Boolean(ordering),
            component: (
              <SortSelect options={orderingOptions} value={ordering} onChange={setOrdering} />
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
                onChange={(e) => setCreatedBefore(e.target.value)}
              />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={reservationState.data}
        {...list.tableProps}
        emptyIcon={Lock}
        emptyTitle="No reservations"
        emptyDescription="No stock holds match these filters."
        minWidth="1020px"
        columnWidths={["280px", "140px", "70px", "150px", "170px", "170px", ...(canRelease ? ["80px"] : [])]}
        unlabelledColumns={["actions"]}
      />

      <ConfirmDialog
        open={Boolean(releasing)}
        onOpenChange={(open) => !open && setReleasing(null)}
        title="Release reservation?"
        description={
          releasing && (
            <>
              {releasing.quantity} × {releasing.variant_sku} held for order {releasing.order_number} returns to
              sellable stock.
            </>
          )
        }
        confirmLabel="Release"
        onConfirm={() => (releasing ? release(releasing) : undefined)}
      />
    </div>
  )
}

export default Reservations
