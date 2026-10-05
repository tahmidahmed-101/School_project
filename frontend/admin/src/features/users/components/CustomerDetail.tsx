import type { ColumnDef } from "@tanstack/react-table"
import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Ban, CheckCircle2, Clock, MapPin, Mail, Phone, ShoppingBag, Trash2, User, Wallet, XCircle, ListOrdered, RotateCcw, Pencil, Plus, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { DataTable } from "@/components/common/data-table"
import { StatusBadge } from "@/components/common/StatusBadge"
import { DeleteModal } from "@/components/common/DeleteModal"
import { DetailPageState } from "@/components/common/DetailPageState"
import { DetailRow } from "@/components/common/DetailRow"
import { PageHeader } from "@/components/common/PageHeader"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import {
  activateUser,
  deactivateUser,
  fetchSingle,
  fetchUserAddresses,
  softDeleteUser,
} from "@/features/users/slices/customerSlice"
import { displayNameOf, type AdminAddress, type AdminUser, type CustomerOrderRow } from "@/features/users/types"
import { api, getApiErrorMessage } from "@/lib/api/client"
import { unwrapList } from "@/lib/api/envelope"
import { resolveDetailState } from "@/lib/detailState"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { AddressFormDialog, CustomerFormDialog, SetRoleDialog } from "./CustomerDialogs"
import { ResetPasswordDialog } from "./ResetPasswordDialog"
import { UserAvatar } from "./UserAvatar"

const RECENT_ORDERS = 10

type Loadable<T> = { forId: string; status: "succeeded" | "failed"; rows: T[]; total: number }

const StatCard = ({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: typeof Wallet; tone: string }) => (
  <Card>
    <CardContent className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-full ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </CardContent>
  </Card>
)

const CustomerDetail = () => {
  const { id = "" } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { singleData, singleStatus, singleError, isMutating } = useAppSelector((state) => state.customers)
  const customer = singleData && singleData.id === id ? (singleData as AdminUser) : null
  useDocumentTitle(customer ? `${displayNameOf(customer)} — Customer` : "Customer Details")

  const [addresses, setAddresses] = useState<Loadable<AdminAddress> | null>(null)
  const [orders, setOrders] = useState<Loadable<CustomerOrderRow> | null>(null)
  const [dialog, setDialog] = useState<"edit" | "role" | "address" | null>(null)

  const loadCustomer = useCallback(() => dispatch(fetchSingle(id)), [dispatch, id])

  const loadAddresses = useCallback(() => {
    const request = dispatch(fetchUserAddresses(id))
    request
      .unwrap()
      .then((rows) => setAddresses({ forId: id, status: "succeeded", rows, total: rows.length }))
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return
        setAddresses({ forId: id, status: "failed", rows: [], total: 0 })
      })
    return request
  }, [dispatch, id])

  // Orders belong to the sales domain; read the customer's latest page straight from
  // /admin/orders/?customer_id= so this page never disturbs state.orders.
  const loadOrders = useCallback(() => {
    const controller = new AbortController()
    api
      .get("/admin/orders/", {
        params: { customer_id: id, page: 1, page_size: RECENT_ORDERS },
        signal: controller.signal,
      })
      .then((res) => {
        const { items, meta } = unwrapList<CustomerOrderRow>(res.data, 1, RECENT_ORDERS)
        setOrders({ forId: id, status: "succeeded", rows: items, total: meta.count })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setOrders({ forId: id, status: "failed", rows: [], total: 0 })
      })
    return controller
  }, [id])

  useEffect(() => {
    const request = loadCustomer()
    return () => request.abort()
  }, [loadCustomer])

  useEffect(() => {
    const request = loadAddresses()
    return () => request.abort()
  }, [loadAddresses])

  useEffect(() => {
    const controller = loadOrders()
    return () => controller.abort()
  }, [loadOrders])

  const runAction = async (thunk: typeof activateUser, success: string) => {
    try {
      await dispatch(thunk(id)).unwrap()
      toast.success(success)
      return true
    } catch (err) {
      toast.error(getApiErrorMessage(err))
      return false
    }
  }

  const pageState = resolveDetailState(singleStatus, singleError, !!customer)
  if (pageState || !customer) {
    return (
      <DetailPageState
        state={pageState ?? "loading"}
        entity="Customer"
        backTo="/customers"
        backLabel="Back to Customers"
        error={singleError}
        onRetry={loadCustomer}
      />
    )
  }

  const name = displayNameOf(customer)
  const summary = customer.order_summary
  const addressRows = addresses?.forId === id ? addresses : null
  const orderRows = orders?.forId === id ? orders : null

  const orderColumns: ColumnDef<CustomerOrderRow>[] = [
    {
      id: "order",
      header: "Order",
      cell: ({ row }) => <span className="font-medium text-primary">{row.original.order_number}</span>,
    },
    { id: "date", header: "Date", cell: ({ row }) => formatDate(row.original.created_at) },
    { id: "total", header: "Total", cell: ({ row }) => formatCurrency(row.original.grand_total) },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ]

  return (
    <div className="section-container space-y-6">
      <PageHeader
        title={name}
        description={`Customer since ${formatDate(customer.date_joined)}`}
        back={{ to: "/customers", label: "Back to customers" }}
        actions={
          <>
            <Button variant="outline" size="action" onClick={() => setDialog("edit")}>
              <Pencil className="size-4" /> Edit
            </Button>
            <Button variant="outline" size="action" onClick={() => setDialog("role")}>
              <ShieldCheck className="size-4" /> Change Role
            </Button>
            <ResetPasswordDialog userId={customer.id} userLabel={name} />
            {customer.is_active ? (
              <Button
                variant="outline"
                size="action"
                disabled={isMutating}
                onClick={() => runAction(deactivateUser, "Customer deactivated")}
              >
                <Ban className="size-4" /> Deactivate
              </Button>
            ) : (
              <Button
                variant="outline"
                size="action"
                disabled={isMutating}
                onClick={() => runAction(activateUser, "Customer activated")}
              >
                <CheckCircle2 className="size-4" /> Activate
              </Button>
            )}
            <DeleteModal
              title={`Delete ${name}?`}
              onConfirm={async () => {
                if (await runAction(softDeleteUser, "Customer deleted")) navigate("/customers")
              }}
              trigger={
                <Button variant="destructive" size="action" disabled={isMutating}>
                  <Trash2 className="size-4" /> Delete
                </Button>
              }
            />
          </>
        }
      />

      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Orders" value={summary.total_orders} icon={ShoppingBag} tone="bg-blue-500/10 text-blue-500" />
          <StatCard label="Total Spent" value={formatCurrency(summary.total_spent)} icon={Wallet} tone="bg-green-500/10 text-green-600" />
          <StatCard label="Open Orders" value={summary.pending_orders} icon={Clock} tone="bg-amber-500/10 text-amber-600" />
          <StatCard label="Cancelled" value={summary.cancelled_orders} icon={XCircle} tone="bg-red-500/10 text-red-500" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-none shadow-sm dark:border-solid">
          <CardHeader>
            <CardTitle level={2} className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5 text-primary" /> Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <UserAvatar user={customer} className="h-12 w-12 text-lg" />
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <p className="min-w-0 break-words text-lg font-semibold">{name}</p>
                <StatusBadge status={customer.is_active ? "active" : "inactive"} />
              </div>
            </div>
            <Separator />
            <div>
              <DetailRow
                label={
                  <span className="flex items-center gap-2">
                    <Mail className="h-4 w-4" /> Email
                  </span>
                }
              >
                <span className="break-all">{customer.email}</span>
              </DetailRow>
              <DetailRow
                label={
                  <span className="flex items-center gap-2">
                    <Phone className="h-4 w-4" /> Phone
                  </span>
                }
              >
                {customer.contact_phone || customer.phone || "—"}
              </DetailRow>
              <DetailRow label="Email verified">{customer.is_email_verified ? "Yes" : "No"}</DetailRow>
              <DetailRow label="Phone verified">{customer.is_phone_verified ? "Yes" : "No"}</DetailRow>
              <DetailRow label="Last sign-in">{formatDateTime(customer.last_login, "Never")}</DetailRow>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm dark:border-solid">
          <CardHeader>
            <CardTitle level={2} className="flex items-center gap-2 text-lg">
              <MapPin className="h-5 w-5 text-primary" /> Addresses
            </CardTitle>
            <CardAction>
              <Button variant="outline" size="sm" onClick={() => setDialog("address")}>
                <Plus className="size-4" /> Add address
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {!addressRows ? (
              <p className="text-sm text-muted-foreground">Loading addresses...</p>
            ) : addressRows.status === "failed" ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                Couldn't load addresses.
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAddresses(null)
                    loadAddresses()
                  }}
                >
                  <RotateCcw className="size-4" />
                  Retry
                </Button>
              </div>
            ) : addressRows.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved addresses.</p>
            ) : (
              <ul className="space-y-3">
                {addressRows.rows.map((address) => (
                  <li key={address.id} className="rounded-lg border p-3 text-sm">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-medium">{address.full_name}</span>
                      <StatusBadge status={address.address_type} tone="info" label={address.address_type} />
                      {address.is_default && <StatusBadge status="default" tone="success" label="Default" />}
                    </div>
                    <p className="text-muted-foreground">
                      {[address.line1, address.city, address.state, address.postal_code, address.country]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    {address.delivery_note && (
                      <p className="mt-1 text-xs text-muted-foreground">Note: {address.delivery_note}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">{address.phone}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-none shadow-sm dark:border-solid">
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20">
          <CardTitle level={2} className="flex items-center gap-2 text-lg">
            <ShoppingBag className="h-5 w-5 text-primary" /> Recent Orders
          </CardTitle>
          {orderRows?.status === "succeeded" && orderRows.total > orderRows.rows.length && (
            <Button variant="link" asChild>
              <Link to={`/orders?customer_id=${customer.id}`}><ListOrdered className="size-4" /> View all {orderRows.total}</Link>
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            embedded
            showPagination={false}
            columns={orderColumns}
            data={orderRows?.status === "succeeded" ? orderRows.rows : []}
            isLoading={!orderRows || (orderRows.status !== "succeeded" && orderRows.status !== "failed")}
            error={orderRows?.status === "failed" ? { message: "Couldn't load this customer's orders." } : null}
            onRetry={() => {
              setOrders(null)
              loadOrders()
            }}
            onRowClick={(order) => navigate(`/order_detail/${order.id}`)}
            emptyTitle="No orders yet"
            emptyDescription="This customer has not placed an order."
            minWidth="0px"
          />
        </CardContent>
      </Card>

      <CustomerFormDialog
        open={dialog === "edit"}
        onOpenChange={(open) => setDialog(open ? "edit" : null)}
        customer={customer}
        onSaved={loadCustomer}
      />
      <SetRoleDialog
        open={dialog === "role"}
        onOpenChange={(open) => setDialog(open ? "role" : null)}
        user={customer}
        // Staff and admins are managed under Staff; this page is for customers.
        onChanged={(role) => {
          if (role !== "customer") navigate("/staffs")
        }}
      />
      <AddressFormDialog
        open={dialog === "address"}
        onOpenChange={(open) => setDialog(open ? "address" : null)}
        customer={customer}
        onSaved={loadAddresses}
      />
    </div>
  )
}

export default CustomerDetail
