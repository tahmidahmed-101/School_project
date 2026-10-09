import type { ColumnDef } from "@tanstack/react-table"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { MapPin, Package, Search, Trash2Icon, User, X, Check } from "lucide-react"

import { PageHeader } from "@/components/common/PageHeader"
import { ProductCell } from "@/components/common/cells"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable } from "@/components/common/data-table"
import { SubmitButton } from "@/components/common/FormActions"
import { useAppDispatch } from "@/app/hooks"
import { createOrder } from "@/features/sales/slices/orderSlice"
import { fetchCarrierOptions } from "@/features/shipping/slices/carrierSlice"
import type { Carrier } from "@/features/shipping/types"
import {
  METHODS_WITHOUT_REFERENCE,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_OPTIONS,
  type PaymentMethod,
} from "@/features/payments/types"
import { KIND_PATHS } from "@/features/sales/shared/kindPaths"
import type { OrderQuote } from "@/features/sales/types"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useDebounced } from "@/hooks/use-debounced"
import { useKind, withKind } from "@/hooks/use-kind"
import { api, getApiErrorMessage } from "@/lib/api/client"
import { unwrapEnvelope, unwrapList } from "@/lib/api/envelope"
import { formatCurrency } from "@/lib/format"

// Minimal views of other domains' endpoints, limited to the fields this form reads.
interface CustomerHit {
  id: string
  email: string
  display_name: string
  phone: string
}
interface AddressHit {
  id: string
  full_name: string
  line1: string
  city: string
  postal_code: string
  country: string
  is_default: boolean
}
interface VariantHit {
  id: string
  sku: string
  product_name: string
  title?: string
  effective_price: string
  stock: number
  is_active: boolean
}
interface DraftLine {
  variant: VariantHit
  quantity: string
}

const NONE = "__none__"

/** Debounced search against a paginated admin list endpoint. */
function useSearch<T>(url: string, query: string, extraParams: Record<string, string> = {}) {
  const q = query.trim()
  const debounced = useDebounced(q)
  const paramsKey = JSON.stringify(extraParams)
  const key = JSON.stringify([url, debounced, paramsKey])
  const [result, setResult] = useState<{ key: string; items: T[] }>({ key: "", items: [] })

  useEffect(() => {
    if (!debounced) return
    const controller = new AbortController()
    api
      .get(url, {
        params: { search: debounced, page: 1, page_size: 8, ...JSON.parse(paramsKey) },
        signal: controller.signal,
      })
      .then((res) => setResult({ key, items: unwrapList<T>(res.data, 1, 8).items }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, items: [] })
      })
    return () => controller.abort()
  }, [url, debounced, paramsKey, key])

  // Stale hits from a previous query are hidden once the box is cleared.
  return { results: q ? result.items : [], loading: !!q && !!debounced && result.key !== key }
}

/** What the pre-order will come to, worked out by the server the same way it places the order. */
function usePreorderQuote(body: Record<string, unknown> | null) {
  const bodyKey = useDebounced(body ? JSON.stringify(body) : "", 500)
  const [result, setResult] = useState<{ key: string; quote: OrderQuote | null; error: string }>({
    key: "",
    quote: null,
    error: "",
  })

  useEffect(() => {
    if (!bodyKey) return
    const controller = new AbortController()
    api
      .post("/admin/orders/quote/", JSON.parse(bodyKey), { signal: controller.signal })
      .then((res) => setResult({ key: bodyKey, quote: unwrapEnvelope<OrderQuote>(res.data), error: "" }))
      .catch((err) => {
        if (controller.signal.aborted) return
        setResult({ key: bodyKey, quote: null, error: getApiErrorMessage(err, "Could not work out the total") })
      })
    return () => controller.abort()
  }, [bodyKey])

  const current = !!body && result.key === bodyKey && JSON.stringify(body) === bodyKey
  return { quote: current ? result.quote : null, error: current ? result.error : "", loading: !!body && !current }
}

const CreateOrder = () => {
  const kind = useKind()
  const isPreorder = kind === "preorder"
  useDocumentTitle(isPreorder ? "New pre-order" : "New Order")
  const navigate = useNavigate()
  const dispatch = useAppDispatch()

  const [customerQuery, setCustomerQuery] = useState("")
  const [customer, setCustomer] = useState<CustomerHit | null>(null)
  const [addresses, setAddresses] = useState<AddressHit[]>([])
  const [addressId, setAddressId] = useState(NONE)
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [carrierId, setCarrierId] = useState(NONE)
  const [variantQuery, setVariantQuery] = useState("")
  const [lines, setLines] = useState<DraftLine[]>([])
  const [capture, setCapture] = useState(true)
  const [method, setMethod] = useState<PaymentMethod>("cod")
  const [submitting, setSubmitting] = useState(false)

  const customerSearch = useSearch<CustomerHit>("/admin/users/", customer ? "" : customerQuery, { role: "customer" })
  const variantSearch = useSearch<VariantHit>("/admin/catalog/variants/", variantQuery, { category_type: kind })

  useEffect(() => {
    const request = dispatch(fetchCarrierOptions())
    request
      .unwrap()
      .then((list) => setCarriers(list.filter((c) => c.is_active)))
      .catch(() => setCarriers([]))
    return () => request.abort()
  }, [dispatch])

  const selectCustomer = (next: CustomerHit | null) => {
    setCustomer(next)
    setAddresses([])
    setAddressId(NONE)
  }

  const customerId = customer?.id
  useEffect(() => {
    if (!customerId) return
    const controller = new AbortController()
    api
      .get(`/admin/users/${customerId}/addresses/`, { signal: controller.signal })
      .then((res) => {
        const list = unwrapEnvelope<AddressHit[]>(res.data) ?? []
        setAddresses(list)
        const preferred = list.find((a) => a.is_default) ?? list[0]
        if (preferred) setAddressId(preferred.id)
      })
      .catch(() => {
        if (!controller.signal.aborted) setAddresses([])
      })
    return () => controller.abort()
  }, [customerId])

  const addVariant = (variant: VariantHit) => {
    setLines((prev) =>
      prev.some((l) => l.variant.id === variant.id)
        ? prev.map((l) => (l.variant.id === variant.id ? { ...l, quantity: String(Number(l.quantity) + 1) } : l))
        : [...prev, { variant, quantity: "1" }]
    )
    setVariantQuery("")
  }

  const linesValid = lines.length > 0 && lines.every((l) => Number.isInteger(Number(l.quantity)) && Number(l.quantity) >= 1)
  const estimate = lines.reduce((sum, l) => sum + Number(l.variant.effective_price) * Number(l.quantity || 0), 0)

  const orderBody = {
    shipping_address_id: addressId === NONE ? null : addressId,
    carrier_id: carrierId === NONE ? null : carrierId,
    lines: lines.map((l) => ({ variant_id: l.variant.id, quantity: Number(l.quantity) })),
  }
  const {
    quote,
    error: quoteError,
    loading: quoteLoading,
  } = usePreorderQuote(
    isPreorder && linesValid ? { ...orderBody, customer_id: customer?.id ?? null, order_type: kind } : null
  )

  const handleSubmit = async () => {
    if (!customer || !linesValid) return
    setSubmitting(true)
    try {
      const order = await dispatch(
        createOrder(
          isPreorder
            ? { ...orderBody, customer_id: customer.id, order_type: kind, capture_payment: false, payment_method: method }
            : {
                ...orderBody,
                customer_id: customer.id,
                capture_payment: capture,
                ...(capture ? { payment_method: method } : {}),
              }
        )
      ).unwrap()
      toast.success(`${isPreorder ? "Pre-order" : "Order"} ${order.order_number} created`)
      navigate(isPreorder ? withKind(`/order_detail/${order.id}`, kind) : `/order_detail/${order.id}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, isPreorder ? "Failed to create pre-order" : "Failed to create order"))
    } finally {
      setSubmitting(false)
    }
  }

  const lineColumns: ColumnDef<DraftLine>[] = [
    {
      id: "product",
      header: "Product",
      cell: ({ row }) => <ProductCell name={row.original.variant.product_name} sku={row.original.variant.sku} />,
    },
    {
      id: "price",
      header: "Price",
      meta: { align: "right" },
      cell: ({ row }) => <span className="text-sm">{formatCurrency(row.original.variant.effective_price)}</span>,
    },
    {
      id: "qty",
      header: "Qty",
      meta: { align: "right" },
      cell: ({ row: { original: l } }) => (
        <Input
          type="number"
          min={1}
          step={1}
          className="h-8 text-right"
          aria-label={`Quantity for ${l.variant.product_name}`}
          value={l.quantity}
          onChange={(e) =>
            setLines((prev) => prev.map((x) => (x.variant.id === l.variant.id ? { ...x, quantity: e.target.value } : x)))
          }
        />
      ),
    },
    {
      id: "remove",
      header: "",
      cell: ({ row: { original: l } }) => (
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive"
          aria-label={`Remove ${l.variant.product_name}`}
          onClick={() => setLines((prev) => prev.filter((x) => x.variant.id !== l.variant.id))}
        >
          <Trash2Icon className="size-4" />
        </Button>
      ),
    },
  ]

  return (
    <div className="section-container space-y-6">
      <PageHeader
        back={{ to: KIND_PATHS[kind].orders, label: isPreorder ? "Back to pre-orders" : "Back to orders" }}
        title={isPreorder ? "New pre-order" : "New order"}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Customer */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {customer ? (
                <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-semibold">{customer.display_name || customer.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {customer.email}
                      {customer.phone && ` · ${customer.phone}`}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Change customer" onClick={() => selectCustomer(null)}>
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search customers by name, email or phone..."
                      aria-label="Search customers"
                      value={customerQuery}
                      onChange={(e) => setCustomerQuery(e.target.value)}
                    />
                  </div>
                  {customerSearch.loading && <p className="text-xs text-muted-foreground">Searching…</p>}
                  {customerSearch.results.length > 0 && (
                    <ul className="divide-y rounded-lg border">
                      {customerSearch.results.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                            onClick={() => selectCustomer(c)}
                          >
                            <span className="font-medium">{c.display_name || c.email}</span>
                            <span className="block text-xs text-muted-foreground">
                              {c.email}
                              {c.phone && ` · ${c.phone}`}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!customerSearch.loading && customerQuery.trim() && customerSearch.results.length === 0 && (
                    <p className="text-xs text-muted-foreground">No customers match.</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Lines */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Products
              </CardTitle>
              <CardDescription>
                {isPreorder
                  ? "Only pre-order items that are open for ordering can be added. Prices and tax are worked out when the pre-order is created."
                  : "Prices, tax and discounts are calculated by the server at checkout."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder={isPreorder ? "Search pre-order items by name or SKU..." : "Search products by name or SKU..."}
                  aria-label="Search products"
                  value={variantQuery}
                  onChange={(e) => setVariantQuery(e.target.value)}
                />
              </div>
              {variantSearch.results.length > 0 && (
                <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
                  {variantSearch.results.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        disabled={!v.is_active}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                        onClick={() => addVariant(v)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {v.product_name}
                            {v.title && <span className="text-muted-foreground"> · {v.title}</span>}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">{v.sku}</span>
                        </span>
                        <span className="shrink-0 text-right text-xs">
                          <span className="block font-semibold">{formatCurrency(v.effective_price)}</span>
                          {!isPreorder && <span className="text-muted-foreground">{v.stock} in stock</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {lines.length > 0 ? (
                <DataTable
                  surface="card"
                  showPagination={false}
                  selectable={false}
                  columns={lineColumns}
                  data={lines}
                  minWidth="0px"
                  columnWidths={["auto", "120px", "100px", "64px"]}
                  unlabelledColumns={["remove"]}
                />
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {isPreorder ? "No items added yet." : "No products added yet."}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Delivery & payment */}
        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Delivery
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field>
                <FieldLabel htmlFor="new-order-address">Ship to</FieldLabel>
                <FieldContent>
                  <Select value={addressId} onValueChange={setAddressId} disabled={!customer}>
                    <SelectTrigger id="new-order-address">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No address</SelectItem>
                      {addresses.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {[a.line1, a.city].filter(Boolean).join(", ") || a.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {customer && addresses.length === 0 && (
                    <FieldDescription>This customer has no saved addresses.</FieldDescription>
                  )}
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="new-order-carrier">Carrier</FieldLabel>
                <FieldContent>
                  <Select value={carrierId} onValueChange={setCarrierId}>
                    <SelectTrigger id="new-order-carrier">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Decide later</SelectItem>
                      {carriers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {isPreorder ? "Used to work out the delivery charge." : "Used to quote the shipping charge at checkout."}
                  </FieldDescription>
                </FieldContent>
              </Field>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isPreorder ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="new-order-method">How the customer will pay</FieldLabel>
                    <FieldContent>
                      <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                        <SelectTrigger id="new-order-method">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHOD_OPTIONS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        Nothing is marked as paid now. When the deposit arrives, record it from the pre-order page; that
                        confirms the pre-order.
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                  <div className="space-y-2 border-t pt-3 text-sm">
                    {quote ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Items</span>
                          <span>{formatCurrency(quote.subtotal)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Tax</span>
                          <span>{formatCurrency(quote.tax_total)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Delivery</span>
                          <span>{formatCurrency(quote.shipping_total)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Total</span>
                          <span className="font-semibold">{formatCurrency(quote.grand_total)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Deposit needed to confirm</span>
                          <span className="font-semibold">{formatCurrency(quote.deposit_due)}</span>
                        </div>
                      </>
                    ) : (
                      <p className={quoteError ? "text-destructive" : "text-muted-foreground"}>
                        {quoteError ||
                          (quoteLoading ? "Working out the total…" : "Add items to see the total and the deposit.")}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-2">
                    <Checkbox id="new-order-capture" checked={capture} onCheckedChange={(v) => setCapture(v === true)} />
                    <div className="space-y-0.5">
                      <Label htmlFor="new-order-capture">Capture payment now</Label>
                      <p className="text-xs text-muted-foreground">
                        Otherwise the order waits for payment; capture it later from the order page.
                      </p>
                    </div>
                  </div>
                  {capture && (
                    <Field>
                      <FieldLabel htmlFor="new-order-method">Method</FieldLabel>
                      <FieldContent>
                        <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                          <SelectTrigger id="new-order-method">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {METHODS_WITHOUT_REFERENCE.map((m) => (
                              <SelectItem key={m} value={m}>
                                {PAYMENT_METHOD_LABELS[m]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FieldDescription>
                          Card / mobile / bank payments need a reference — leave uncaptured and capture them from the order.
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  )}
                  <div className="flex items-center justify-between border-t pt-3 text-sm">
                    <span className="text-muted-foreground">Items (before tax & shipping)</span>
                    <span className="font-semibold">{formatCurrency(estimate)}</span>
                  </div>
                </>
              )}
              <SubmitButton icon={Check} type="button" loading={submitting} className="w-full" onClick={handleSubmit} disabled={!customer || !linesValid}>
                {isPreorder ? "Create pre-order" : "Create order"}
              </SubmitButton>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default CreateOrder
