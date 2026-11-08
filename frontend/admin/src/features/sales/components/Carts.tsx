import { useState } from "react"
import { Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { ShoppingCart, User, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DataTable } from "@/components/common/data-table"
import { DetailRow } from "@/components/common/DetailRow"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { SortSelect } from "@/components/common/SortSelect"
import { TableActions } from "@/components/common/TableActions"
import { DateCell, MoneyCell, ProductCell, TextCell } from "@/components/common/cells"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useCan } from "@/hooks/use-can"
import { useLastValue } from "@/hooks/use-dialog-presence"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { customerDetailPath } from "@/features/users/paths"
import { useListPage } from "@/hooks/use-list-page"
import { formatCurrency, formatDateTime } from "@/lib/format"
import type { Option } from "@/lib/types"
import { ADMIN_ONLY } from "@/features/system/permissions"

import { fetchAll } from "../slices/cartSlice"
import type { CustomerCart } from "../types"

// AdminCustomerCartListView ordering_fields: updated_at, created_at, subtotal.
const ORDERING_OPTIONS: Option[] = [
  { label: "Latest activity", value: "-updated_at" },
  { label: "Oldest activity", value: "updated_at" },
  { label: "Newest first", value: "-created_at" },
  { label: "Highest subtotal", value: "-subtotal" },
  { label: "Lowest subtotal", value: "subtotal" },
]

const cartOwner = (cart: CustomerCart) => cart.customer_name || cart.customer_email || "Guest"

const GuestBadge = () => <Badge variant="secondary">Guest</Badge>

const ReachedCheckoutBadge = () => <Badge variant="warning">Left at checkout</Badge>

function CartDetailDialog({ cart: selected, onClose }: { cart: CustomerCart | null; onClose: () => void }) {
  // Keeps the last cart on screen while the dialog fades out.
  const cart = useLastValue(selected)
  // The customer page is admin-only (see users/module.ts).
  const canViewCustomer = useCan(ADMIN_ONLY)

  return (
    <Dialog open={!!selected} onOpenChange={(open) => !open && onClose()}>
      {cart && (
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              {cart.is_guest_cart && !cart.customer_name ? "Guest cart" : cartOwner(cart)}
              {cart.is_guest_cart && <GuestBadge />}
              {cart.reached_checkout && <ReachedCheckoutBadge />}
            </DialogTitle>
            <DialogDescription>
              {cart.customer_email || cart.customer_phone ? (
                <>
                  {cart.customer_email && <span className="block">{cart.customer_email}</span>}
                  {cart.customer_phone && <span className="block">{cart.customer_phone}</span>}
                </>
              ) : cart.is_guest_cart ? (
                "An anonymous visitor who hasn't reached checkout yet."
              ) : (
                "No contact details"
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-4">
            <div>
              <span className="block text-xs text-muted-foreground">Subtotal</span>
              <span className="text-2xl font-bold text-primary">{formatCurrency(cart.subtotal)}</span>
            </div>
            <div>
              <span className="block text-xs text-muted-foreground">Items</span>
              <span className="font-semibold text-foreground">{cart.item_count}</span>
            </div>
          </div>

          <ul className="max-h-64 divide-y divide-border overflow-y-auto">
            {cart.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 py-2">
                <ProductCell name={item.product_name} sku={item.sku} />
                <span className="shrink-0 text-sm tabular-nums whitespace-nowrap">
                  {item.quantity} × {formatCurrency(item.unit_price)}
                </span>
              </li>
            ))}
          </ul>

          <div>
            <DetailRow label="Last activity">{formatDateTime(cart.updated_at)}</DetailRow>
            <DetailRow label="Started">{formatDateTime(cart.created_at)}</DetailRow>
          </div>

          <DialogFooter>
            {canViewCustomer && cart.customer_id && (
              <Button variant="outline" asChild>
                <Link to={customerDetailPath(cart.customer_id)}>
                  <User className="size-4" /> View customer
                </Link>
              </Button>
            )}
            <Button onClick={onClose}>
              <X className="size-4" /> Close
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}

const Carts = () => {
  const dispatch = useAppDispatch()
  useDocumentTitle("Carts")
  const cartsState = useAppSelector((state) => state.customerCarts)

  const [ordering, setOrdering] = useState<Option | null>(ORDERING_OPTIONS[0])
  const [viewing, setViewing] = useState<CustomerCart | null>(null)

  const list = useListPage({
    fetch: (p) => dispatch(fetchAll(p)),
    state: cartsState,
    params: { kind: "stock", ordering: ordering?.value ?? ORDERING_OPTIONS[0].value },
  })

  const columns: ColumnDef<CustomerCart>[] = [
    {
      id: "customer",
      header: "CUSTOMER",
      cell: ({ row }) =>
        row.original.is_guest_cart ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {row.original.customer_name && (
              <span className="truncate text-sm font-medium text-foreground">{row.original.customer_name}</span>
            )}
            <GuestBadge />
            {row.original.reached_checkout && <ReachedCheckoutBadge />}
          </div>
        ) : (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{row.original.customer_name || "—"}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.customer_email}</p>
          </div>
        ),
    },
    {
      id: "phone",
      header: "PHONE",
      cell: ({ row }) => <TextCell value={row.original.customer_phone} />,
    },
    {
      id: "items",
      header: "ITEMS",
      cell: ({ row }) => {
        const { items, item_count } = row.original
        const more = items.length - 1
        return (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {items[0]?.product_name ?? "—"}
              {more > 0 && <span className="text-muted-foreground"> +{more} more</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {item_count} {item_count === 1 ? "item" : "items"}
            </p>
          </div>
        )
      },
    },
    {
      accessorKey: "subtotal",
      header: "SUBTOTAL",
      cell: ({ row }) => <MoneyCell value={row.original.subtotal} emphasis />,
    },
    {
      accessorKey: "updated_at",
      header: "LAST ACTIVITY",
      cell: ({ row }) => <DateCell value={row.original.updated_at} withTime />,
    },
    {
      accessorKey: "created_at",
      header: "STARTED",
      cell: ({ row }) => <DateCell value={row.original.created_at} className="text-muted-foreground" />,
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => (
        <TableActions itemName={`cart of ${cartOwner(row.original)}`} onView={() => setViewing(row.original)} />
      ),
    },
  ]

  return (
    <div className="section-container">
      <PageHeader title="Carts" />

      <FilterToolbar
        searchPlaceholder="Search customer name, email or phone..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[
          {
            component: <SortSelect options={ORDERING_OPTIONS} value={ordering} onChange={setOrdering} />,
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={cartsState.data}
        {...list.tableProps}
        onRowClick={setViewing}
        emptyIcon={ShoppingCart}
        emptyTitle="No open carts"
        emptyDescription="Carts with items that haven't been checked out show up here."
        minWidth="1050px"
        columnWidths={["220px", "140px", "260px", "120px", "210px", "120px", "80px"]}
        unlabelledColumns={["actions"]}
      />

      <CartDetailDialog cart={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}

export default Carts
