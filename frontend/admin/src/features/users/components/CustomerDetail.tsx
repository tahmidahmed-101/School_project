import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  MapPin,
  Mail,
  Phone,
  ShoppingBag,
  Trash2,
  User,
  Wallet,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusBadge } from "@/components/common/StatusBadge"
import { DeleteModal } from "@/components/common/DeleteModal"
import { DetailPageState } from "@/components/common/DetailPageState"
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
import { ResetPasswordDialog } from "./ResetPasswordDialog"
import { UserAvatar } from "./UserAvatar"

const RECENT_ORDERS = 10

type Loadable<T> = { forId: string; status: "succeeded" | "failed"; rows: T[]; total: number }

const StatCard = ({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: typeof Wallet; tone: string }) => (
  <Card className="border-none shadow-sm">
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

  return (
    <div className="section-container space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="back" size="icon" onClick={() => navigate("/customers")} aria-label="Back to customers">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{name}</h1>
            <p className="text-muted-foreground text-sm">Customer since {formatDate(customer.date_joined)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
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
            description="The account is soft-deleted: the customer can no longer sign in. You can restore it from the Customers list with “Show deleted”."
            onConfirm={async () => {
              if (await runAction(softDeleteUser, "Customer deleted")) navigate("/customers")
            }}
            trigger={
              <Button variant="destructive" size="action" disabled={isMutating}>
                <Trash2 className="size-4" /> Delete
              </Button>
            }
          />
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Orders" value={summary.total_orders} icon={ShoppingBag} tone="bg-blue-500/10 text-blue-500" />
          <StatCard label="Total Spent" value={formatCurrency(summary.total_spent)} icon={Wallet} tone="bg-green-500/10 text-green-600" />
          <StatCard label="Open Orders" value={summary.pending_orders} icon={Clock} tone="bg-amber-500/10 text-amber-600" />
          <StatCard label="Cancelled" value={summary.cancelled_orders} icon={XCircle} tone="bg-red-500/10 text-red-500" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle level={2} className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5 text-primary" /> Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <UserAvatar user={customer} className="h-12 w-12 text-lg" />
              <div>
                <p className="text-lg font-semibold">{name}</p>
                <StatusBadge status={customer.is_active ? "active" : "inactive"} />
              </div>
            </div>
            <Separator />
            <dl className="grid grid-cols-1 gap-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" /> Email</dt>
                <dd className="font-medium break-all text-right">{customer.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" /> Phone</dt>
                <dd className="font-medium">{customer.contact_phone || customer.phone || "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Email verified</dt>
                <dd className="font-medium">{customer.is_email_verified ? "Yes" : "No"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Phone verified</dt>
                <dd className="font-medium">{customer.is_phone_verified ? "Yes" : "No"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Last sign-in</dt>
                <dd className="font-medium">{formatDateTime(customer.last_login, "Never")}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle level={2} className="flex items-center gap-2 text-lg">
              <MapPin className="h-5 w-5 text-primary" /> Addresses
            </CardTitle>
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

      <Card className="overflow-hidden border-none shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20">
          <CardTitle level={2} className="flex items-center gap-2 text-lg">
            <ShoppingBag className="h-5 w-5 text-primary" /> Recent Orders
          </CardTitle>
          {orderRows?.status === "succeeded" && orderRows.total > orderRows.rows.length && (
            <Button variant="link" asChild>
              <Link to={`/orders?customer_id=${customer.id}`}>View all {orderRows.total}</Link>
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!orderRows || orderRows.status !== "succeeded" ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    {orderRows?.status === "failed" ? (
                      <span className="inline-flex items-center gap-3">
                        Couldn't load this customer's orders.
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setOrders(null)
                            loadOrders()
                          }}
                        >
                          Retry
                        </Button>
                      </span>
                    ) : (
                      "Loading orders..."
                    )}
                  </TableCell>
                </TableRow>
              ) : orderRows.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No orders yet.
                  </TableCell>
                </TableRow>
              ) : (
                orderRows.rows.map((order) => (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/order_detail/${order.id}`)}
                  >
                    <TableCell className="font-medium text-primary">{order.order_number}</TableCell>
                    <TableCell>{formatDate(order.created_at)}</TableCell>
                    <TableCell>{formatCurrency(order.grand_total)}</TableCell>
                    <TableCell><StatusBadge status={order.status} /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export default CustomerDetail
