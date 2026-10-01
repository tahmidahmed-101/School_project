import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, Loader2, MapPin, Package, Search, Trash2Icon, User, X } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAppDispatch } from "@/app/hooks"
import { createOrder } from "@/features/sales/slices/orderSlice"
import { fetchCarrierOptions } from "@/features/shipping/slices/carrierSlice"
import type { Carrier } from "@/features/shipping/types"
import { METHODS_WITHOUT_REFERENCE, PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/features/payments/types"
import { useDocumentTitle } from "@/hooks/use-document-title"
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
  size: string
  color: string
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
  const [results, setResults] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const paramsKey = JSON.stringify(extraParams)

  useEffect(() => {
    const q = query.trim()
    if (!q) return
    const controller = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await api.get(url, {
          params: { search: q, page: 1, page_size: 8, ...JSON.parse(paramsKey) },
          signal: controller.signal,
        })
        setResults(unwrapList<T>(res.data, 1, 8).items)
      } catch {
        if (!controller.signal.aborted) setResults([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 300)
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [url, query, paramsKey])

  // Stale hits from a previous query are hidden once the box is cleared.
  return { results: query.trim() ? results : [], loading: query.trim() ? loading : false }
}

const CreateOrder = () => {
  useDocumentTitle("New Order")
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
  const variantSearch = useSearch<VariantHit>("/admin/catalog/variants/", variantQuery)

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

  const handleSubmit = async () => {
    if (!customer || !linesValid) return
    setSubmitting(true)
    try {
      const order = await dispatch(
        createOrder({
          customer_id: customer.id,
          shipping_address_id: addressId === NONE ? null : addressId,
          carrier_id: carrierId === NONE ? null : carrierId,
          lines: lines.map((l) => ({ variant_id: l.variant.id, quantity: Number(l.quantity) })),
          capture_payment: capture,
          ...(capture ? { payment_method: method } : {}),
        })
      ).unwrap()
      toast.success(`Order ${order.order_number} created`)
      navigate(`/order_detail/${order.id}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to create order"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="section-container space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="back" size="icon" onClick={() => navigate("/orders")} aria-label="Back to orders">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">New order</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Phone or manual order placed on a customer's behalf.</p>
        </div>
      </div>

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
              <CardDescription>Prices, tax and discounts are calculated by the server at checkout.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search products by name or SKU..."
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
                            {[v.size, v.color].filter(Boolean).length > 0 && (
                              <span className="text-muted-foreground"> · {[v.size, v.color].filter(Boolean).join(" / ")}</span>
                            )}
                          </span>
                          <span className="font-mono text-xs uppercase text-muted-foreground">{v.sku}</span>
                        </span>
                        <span className="shrink-0 text-right text-xs">
                          <span className="block font-semibold">{formatCurrency(v.effective_price)}</span>
                          <span className="text-muted-foreground">{v.stock} in stock</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {lines.length > 0 ? (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="w-[100px] text-right">Qty</TableHead>
                        <TableHead className="w-[50px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((l) => (
                        <TableRow key={l.variant.id}>
                          <TableCell>
                            <p className="text-sm font-medium">{l.variant.product_name}</p>
                            <p className="font-mono text-xs uppercase text-muted-foreground">{l.variant.sku}</p>
                          </TableCell>
                          <TableCell className="text-right text-sm">{formatCurrency(l.variant.effective_price)}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              className="h-8 text-right"
                              aria-label={`Quantity for ${l.variant.product_name}`}
                              value={l.quantity}
                              onChange={(e) =>
                                setLines((prev) =>
                                  prev.map((x) => (x.variant.id === l.variant.id ? { ...x, quantity: e.target.value } : x))
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              aria-label={`Remove ${l.variant.product_name}`}
                              onClick={() => setLines((prev) => prev.filter((x) => x.variant.id !== l.variant.id))}
                            >
                              <Trash2Icon className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">No products added yet.</p>
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
                  <FieldDescription>Used to quote the shipping charge at checkout.</FieldDescription>
                </FieldContent>
              </Field>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
              <Button className="w-full" onClick={handleSubmit} disabled={!customer || !linesValid || submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Create order
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default CreateOrder
