import type { ColumnDef } from "@tanstack/react-table"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { CreditCard, Loader2, MapPin, Package, Search, Trash2Icon, User, Check } from "lucide-react"

import { PageHeader } from "@/components/common/PageHeader"
import { ProductCell, Thumbnail } from "@/components/common/cells"
import { EmptyState } from "@/components/common/EmptyState"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
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
  type PaymentMethod,
} from "@/features/payments/types"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useDebouncedSearch } from "@/hooks/use-debounced-search"
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
  product_code: string
  title?: string
  effective_price: string
  stock: number
  is_active: boolean
  primary_image?: string | null
}
interface DraftLine {
  variant: VariantHit
  quantity: string
}

const NONE = "__none__"
const CUSTOMER_PARAMS = { role: "customer" }

const customerName = (c: CustomerHit) => c.display_name || c.email || c.phone
const customerContact = (c: CustomerHit) => 
  [c.email, c.phone].filter((part) => part && part !== customerName(c)).join(" · ")

function CustomerAvatar({ customer }: { customer: CustomerHit }) {
  return (
    <Avatar className="size-9">
      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
        {customerName(customer).trim().slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
}

/**
 * Search box over a paginated admin list endpoint. Its suggestions open as soon as the box is
 * clicked, before anything is typed, and narrow as the user types.
 */
function SearchDropdown<T extends { id: string }>({
  url,
  params,
  placeholder,
  label,
  emptyText,
  onPick,
  isDisabled,
  renderItem,
}: {
  url: string
  params: Record<string, string>
  placeholder: string
  label: string
  emptyText: string
  onPick: (item: T) => void
  isDisabled?: (item: T) => boolean
  renderItem: (item: T) => ReactNode
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const paramsKey = JSON.stringify(params)
  const { results, loading } = useDebouncedSearch({
    query: query.trim(),
    delay: 250,
    enabled: open,
    search: async (search, signal) => {
      const res = await api.get(url, {
        params: { ...(search ? { search } : {}), page: 1, page_size: 20, ...JSON.parse(paramsKey) },
        signal,
      })
      return unwrapList<T>(res.data, 1, 20).items
    },
    refetchKey: `${url}:${paramsKey}`,
  })

  return (
    // The suggestions render in a popover (a portal on <body>), so the card can't clip them.
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={boxRef} className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={placeholder}
            aria-label={label}
            autoComplete="off"
            value={query}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        // Typing continues in the search box; the list must not take focus.
        onOpenAutoFocus={(e) => e.preventDefault()}
        // A click back in the search box is not "outside".
        onInteractOutside={(e) => {
          if (boxRef.current?.contains(e.target as Node)) e.preventDefault()
        }}
        className="max-h-72 w-(--radix-popover-trigger-width) overflow-y-auto p-0"
      >
        {loading && results.length === 0 ? (
          <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Searching…
          </div>
        ) : results.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">{emptyText}</div>
        ) : (
          <ul role="listbox" className="p-1">
            {results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={isDisabled?.(item)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-50"
                  onClick={() => {
                    onPick(item)
                    setOpen(false)
                    setQuery("")
                  }}
                >
                  {renderItem(item)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

const CreateOrder = () => {
  useDocumentTitle("New Order")
  const navigate = useNavigate()
  const dispatch = useAppDispatch()

  const [customer, setCustomer] = useState<CustomerHit | null>(null)
  const [addresses, setAddresses] = useState<AddressHit[]>([])
  const [addressId, setAddressId] = useState(NONE)
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [carrierId, setCarrierId] = useState(NONE)
  const [lines, setLines] = useState<DraftLine[]>([])
  const [capture, setCapture] = useState(true)
  const [method, setMethod] = useState<PaymentMethod>("cod")
  const [submitting, setSubmitting] = useState(false)


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
  }

  const linesValid = lines.length > 0 && lines.every((l) => Number.isInteger(Number(l.quantity)) && Number(l.quantity) >= 1)
  const estimate = lines.reduce((sum, l) => sum + Number(l.variant.effective_price) * Number(l.quantity || 0), 0)

  const orderBody = {
    shipping_address_id: addressId === NONE ? null : addressId,
    carrier_id: carrierId === NONE ? null : carrierId,
    lines: lines.map((l) => ({ variant_id: l.variant.id, quantity: Number(l.quantity) })),
  }

  const handleSubmit = async () => {
    if (!customer || !linesValid) return
    setSubmitting(true)
    try {
      const order = await dispatch(
        createOrder({
          ...orderBody,
          customer_id: customer.id,
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

  const lineColumns: ColumnDef<DraftLine>[] = [
    {
      id: "product",
      header: "Product",
      cell: ({ row: { original: l } }) => (
        <div className="flex min-w-0 items-center gap-3">
          <Thumbnail src={l.variant.primary_image} className="size-10" />
          <ProductCell name={l.variant.product_name} sub={l.variant.title} sku={l.variant.sku} />
        </div>
      ),
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
          className="ml-auto h-9 w-20 text-right"
          aria-label={`Quantity for ${l.variant.product_name}`}
          value={l.quantity}
          onChange={(e) =>
            setLines((prev) => prev.map((x) => (x.variant.id === l.variant.id ? { ...x, quantity: e.target.value } : x)))
          }
        />
      ),
    },
    {
      id: "total",
      header: "Total",
      meta: { align: "right" },
      cell: ({ row: { original: l } }) => (
        <span className="text-sm font-semibold">
          {formatCurrency(Number(l.variant.effective_price) * Number(l.quantity || 0))}
        </span>
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
        back={{ to: "/orders", label: "Back to orders" }}
        title="New order"
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
            <CardContent>
              {customer ? (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
                  <CustomerAvatar customer={customer} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{customerName(customer)}</p>
                    <p className="truncate text-xs text-muted-foreground">{customerContact(customer)}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => selectCustomer(null)}>
                    Change
                  </Button>
                </div>
              ) : (
                <SearchDropdown<CustomerHit>
                  url="/admin/users/"
                  params={CUSTOMER_PARAMS}
                  placeholder="Search customers by name, email or phone..."
                  label="Search customers"
                  emptyText="No customers match."
                  onPick={selectCustomer}
                  renderItem={(c) => (
                    <>
                      <CustomerAvatar customer={c} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{customerName(c)}</span>
                        <span className="block truncate text-xs text-muted-foreground">{customerContact(c)}</span>
                      </span>
                    </>
                  )}
                />
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
            <CardContent className="space-y-4">
              <SearchDropdown<VariantHit>
                url="/admin/catalog/variants/"
                params={{ category_type: "stock" }}
                placeholder="Search products by name, SKU or code..."
                label="Search products"
                emptyText="No products match."
                onPick={addVariant}
                isDisabled={(v) => !v.is_active}
                renderItem={(v) => (
                  <>
                    <Thumbnail src={v.primary_image} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {v.product_name}
                        {v.title && <span className="font-normal text-muted-foreground"> · {v.title}</span>}
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        #{v.product_code} · {v.sku}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs">
                      <span className="block text-sm font-semibold">{formatCurrency(v.effective_price)}</span>
                      <span className={v.stock > 0 ? "text-muted-foreground" : "text-destructive"}>
                        {v.stock > 0 ? `${v.stock} in stock` : "Out of stock"}
                      </span>
                    </span>
                  </>
                )}
              />

              {lines.length > 0 ? (
                <DataTable
                  surface="card"
                  showPagination={false}
                  selectable={false}
                  columns={lineColumns}
                  data={lines}
                  minWidth="0px"
                  columnWidths={["auto", "110px", "110px", "120px", "56px"]}
                  unlabelledColumns={["remove"]}
                />
              ) : (
                <EmptyState
                  icon={Package}
                  title="No products added yet"
                  description="Click the search box above and pick an item to add it to the order."
                  className="rounded-lg border border-dashed py-8"
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Delivery & payment: stays in view while a long list of lines scrolls. */}
        <div className="space-y-6 lg:sticky lg:top-0 lg:self-start">
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
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                Payment
              </CardTitle>
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
                <span className="text-muted-foreground">
                  {lines.length} {lines.length === 1 ? "item" : "items"} (before tax & shipping)
                </span>
                <span className="text-base font-semibold">{formatCurrency(estimate)}</span>
              </div>
              <SubmitButton icon={Check} type="button" loading={submitting} className="w-full" onClick={handleSubmit} disabled={!customer || !linesValid}>
                Create order
              </SubmitButton>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default CreateOrder
