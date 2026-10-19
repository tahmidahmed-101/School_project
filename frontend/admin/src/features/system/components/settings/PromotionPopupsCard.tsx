import { useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { ImageIcon, Megaphone, Plus, PlusIcon, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { DataTable } from "@/components/common/data-table"
import { TableActions } from "@/components/common/TableActions"
import { ProductCell, TextCell, Thumbnail } from "@/components/common/cells"
import { StatusBadge } from "@/components/common/StatusBadge"
import type { StatusTone } from "@/components/common/status-tones"
import { FormDialog, SwitchField } from "@/components/common/FormDialog"
import { DateField, FormField, SelectField, TextareaField, TextField } from "@/components/common/form-fields"
import { ImagePicker } from "@/components/common/ImagePicker"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { ProductPickerDialog } from "@/features/catalog/components/ProductPickerDialog"
import type { Sale } from "@/features/marketing/types"
import {
  deletePromotionPopup,
  fetchPromotionPopups,
  savePromotionPopup,
} from "@/features/system/slices/businessSettingsSlice"
import type { PromotionPopup, ShopPlacement } from "@/features/system/types"
import { api, getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { unwrapList } from "@/lib/api/envelope"
import { formatDateTime, fromDatetimeLocal, toDatetimeLocal } from "@/lib/format"
import { reportFormError } from "@/lib/forms"

/** MAX_PROMOTION_PRODUCTS in api/v1/admin/business/serializers.py. */
const MAX_PRODUCTS = 12

const CARD_COPY: Record<ShopPlacement, { title: string; description: string }> = {
  home: {
    title: "Promotion Popups",
    description:
      "A popup on the shop home page that promotes a running sale. Prices and the discount come from the sale. When several could show, the highest priority wins.",
  },
  preorder: {
    title: "Pre-order Popups",
    description:
      "A popup on the pre-order page. Featured products show their pre-order price and expected delivery while they are open for pre-order. When several could show, the highest priority wins.",
  },
}

/** What the storefront does with a popup right now. The server decides for real; this mirrors its rule. */
function popupState(popup: PromotionPopup): { label: string; tone: StatusTone } {
  const now = Date.now()
  if (!popup.is_active) return { label: "Off", tone: "secondary" }
  if (now < new Date(popup.starts_at).getTime()) return { label: "Scheduled", tone: "info" }
  if (now >= new Date(popup.ends_at).getTime()) return { label: "Ended", tone: "secondary" }
  if (popup.sale && popup.sale.status !== "running") return { label: "Sale not running", tone: "warning" }
  return { label: "Live", tone: "success" }
}

const productCount = (popup: PromotionPopup) =>
  `${popup.products.length} product${popup.products.length === 1 ? "" : "s"}`

export function PromotionPopupsCard({ canManage, placement }: { canManage: boolean; placement: ShopPlacement }) {
  const dispatch = useAppDispatch()
  const { data: allPopups, status, error } = useAppSelector((state) => state.businessSettings.promotionPopups)
  const data = useMemo(() => allPopups.filter((popup) => popup.placement === placement), [allPopups, placement])
  const [saving, setSaving] = useState<string | null>(null)
  const [editing, setEditing] = useState<PromotionPopup | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const toggle = async (popup: PromotionPopup, is_active: boolean) => {
    setSaving(popup.id)
    try {
      await dispatch(savePromotionPopup({ id: popup.id, values: { is_active } })).unwrap()
      toast.success(`${popup.name} switched ${is_active ? "on" : "off"}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't update the popup"))
    } finally {
      setSaving(null)
    }
  }

  const handleDelete = async (popup: PromotionPopup) => {
    try {
      await dispatch(deletePromotionPopup(popup.id)).unwrap()
      toast.success(`${popup.name} deleted`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete popup"))
    }
  }

  const columns: ColumnDef<PromotionPopup>[] = [
    {
      id: "popup",
      header: "POPUP",
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <Thumbnail src={row.original.image ?? undefined} icon={ImageIcon} className="w-16" />
          <ProductCell
            name={row.original.name}
            sub={
              row.original.sale
                ? `${row.original.sale.name} · ${Number(row.original.sale.percent_off)}% · ${productCount(row.original)}`
                : productCount(row.original)
            }
          />
        </div>
      ),
    },
    {
      id: "window",
      header: "SHOWN",
      cell: ({ row }) => (
        <TextCell value={`${formatDateTime(row.original.starts_at)} – ${formatDateTime(row.original.ends_at)}`} />
      ),
    },
    {
      accessorKey: "priority",
      header: "PRIORITY",
      cell: ({ row }) => <TextCell value={row.original.priority} />,
    },
    {
      id: "status",
      header: "STATUS",
      cell: ({ row }) => {
        const state = popupState(row.original)
        return <StatusBadge status={state.label} tone={state.tone} label={state.label} />
      },
    },
    {
      id: "active",
      header: "ON",
      cell: ({ row }) => (
        <Switch
          aria-label={`Switch ${row.original.name} on`}
          checked={row.original.is_active}
          disabled={!canManage || saving === row.original.id}
          onCheckedChange={(checked) => toggle(row.original, checked)}
        />
      ),
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "ACTIONS",
            cell: ({ row }) => (
              <TableActions
                itemName={row.original.name}
                onEdit={() => {
                  setEditing(row.original)
                  setFormOpen(true)
                }}
                onDelete={() => handleDelete(row.original)}
              />
            ),
          } satisfies ColumnDef<PromotionPopup>,
        ]
      : []),
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{CARD_COPY[placement].title}</CardTitle>
        <CardDescription>{CARD_COPY[placement].description}</CardDescription>
        {canManage && (
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="h-4 w-4" />
              Add popup
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <DataTable
          embedded
          showPagination={false}
          columns={columns}
          data={data}
          isLoading={status === "loading" && !data.length}
          error={status === "failed" && !data.length ? error : null}
          onRetry={() => dispatch(fetchPromotionPopups())}
          emptyIcon={Megaphone}
          emptyTitle="No promotion popups"
          emptyDescription="The storefront shows no popup."
          minWidth="760px"
          columnWidths={["auto", "220px", "80px", "130px", "70px", ...(canManage ? ["80px"] : [])]}
          unlabelledColumns={["actions"]}
        />
      </CardContent>

      {canManage && (
        <PromotionPopupFormDialog open={formOpen} onOpenChange={setFormOpen} popup={editing} placement={placement} />
      )}
    </Card>
  )
}

const schema = z
  .object({
    name: z.string().trim().min(1, "Give the popup a name"),
    title_en: z.string().trim().min(1, "Enter a title"),
    title_bn: z.string().trim(),
    body_en: z.string().trim(),
    body_bn: z.string().trim(),
    cta_label_en: z.string().trim(),
    cta_label_bn: z.string().trim(),
    cta_url: z.string().trim(),
    sale_id: z.string(),
    products: z
      .array(z.object({ id: z.string(), name: z.string() }))
      .max(MAX_PRODUCTS, `At most ${MAX_PRODUCTS} products`),
    starts_at: z.string().min(1, "Choose when it starts"),
    ends_at: z.string().min(1, "Choose when it ends"),
    priority: z.string().trim().regex(/^\d+$/, "Enter a whole number"),
    is_active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.starts_at && v.ends_at && v.ends_at <= v.starts_at) {
      ctx.addIssue({ code: "custom", path: ["ends_at"], message: "Must be after the start" })
    }
    if ((v.cta_label_en || v.cta_label_bn) && !v.cta_url) {
      ctx.addIssue({ code: "custom", path: ["cta_url"], message: "A button label needs a link" })
    }
  })
type FormValues = z.infer<typeof schema>

/** The API's `product_ids` errors belong to the `products` list here. */
const API_FIELDS: Record<string, keyof FormValues> = { product_ids: "products" }

const EMPTY: FormValues = {
  name: "",
  title_en: "",
  title_bn: "",
  body_en: "",
  body_bn: "",
  cta_label_en: "",
  cta_label_bn: "",
  cta_url: "",
  sale_id: "",
  products: [],
  starts_at: "",
  ends_at: "",
  priority: "0",
  is_active: true,
}

/** Every sale, for the dropdown; the status is shown so a scheduled or ended one is chosen knowingly. */
function useSaleOptions(open: boolean) {
  const [sales, setSales] = useState<Sale[]>([])
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    api
      .get("/admin/sales/", { params: { page: 1, page_size: 100 }, signal: controller.signal })
      .then((res) => setSales(unwrapList<Sale>(res.data).items))
      .catch(() => {
        if (!controller.signal.aborted) toast.error("Couldn't load the sales")
      })
    return () => controller.abort()
  }, [open])
  return sales.map((sale) => ({
    value: sale.id,
    label: `${sale.name} — ${Number(sale.percent_off)}% (${sale.status})`,
  }))
}

function PromotionPopupFormDialog({
  open,
  onOpenChange,
  popup,
  placement,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  popup: PromotionPopup | null
  placement: ShopPlacement
}) {
  const isShop = placement === "home"
  const dispatch = useAppDispatch()
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const saleOptions = useSaleOptions(open && isShop)
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY })

  useEffect(() => {
    if (!open) return
    reset(
      popup
        ? {
            name: popup.name,
            title_en: popup.title_en,
            title_bn: popup.title_bn,
            body_en: popup.body_en,
            body_bn: popup.body_bn,
            cta_label_en: popup.cta_label_en,
            cta_label_bn: popup.cta_label_bn,
            cta_url: popup.cta_url,
            sale_id: popup.sale?.id ?? "",
            products: popup.products.map(({ id, name }) => ({ id, name })),
            starts_at: toDatetimeLocal(popup.starts_at),
            ends_at: toDatetimeLocal(popup.ends_at),
            priority: String(popup.priority),
            is_active: popup.is_active,
          }
        : EMPTY
    )
  }, [open, popup, reset])

  // The popup's own sale stays choosable even if the list has not loaded it (more than 100 sales).
  const ownSale = popup?.sale
  const options =
    ownSale && !saleOptions.some((option) => option.value === ownSale.id)
      ? [{ value: ownSale.id, label: `${ownSale.name} — ${Number(ownSale.percent_off)}%` }, ...saleOptions]
      : saleOptions

  const close = (next: boolean) => {
    if (!next) {
      setImageFile(null)
      setRemoveImage(false)
      setImageError(null)
    }
    onOpenChange(next)
  }

  const onSubmit = async (values: FormValues) => {
    const { products, priority, starts_at, ends_at, sale_id, ...rest } = values
    if (isShop && !sale_id) {
      setError("sale_id", { message: "Choose the sale" })
      return
    }
    try {
      await dispatch(
        savePromotionPopup({
          id: popup?.id,
          values: {
            ...rest,
            // Placement is fixed once created; a pre-order popup has no sale.
            ...(popup ? {} : { placement }),
            ...(isShop ? { sale_id } : {}),
            product_ids: products.map((product) => product.id),
            priority: Number(priority),
            starts_at: fromDatetimeLocal(starts_at),
            ends_at: fromDatetimeLocal(ends_at),
          },
          image: imageFile,
          removeImage: removeImage && !imageFile,
        })
      ).unwrap()
      toast.success(`Popup ${popup ? "updated" : "added"}`)
      close(false)
    } catch (err) {
      const imageMessage = getApiFieldErrors(err).image
      if (imageMessage) setImageError(imageMessage)
      reportFormError(err, {
        setError,
        fields: Object.keys(values),
        fieldMap: API_FIELDS,
        fallback: "Failed to save popup",
      })
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title={popup ? "Edit popup" : "Add popup"}
      description="Title, text and button are shown in the language the shopper is browsing in."
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={popup ? "Save popup" : "Add popup"}
      size="lg"
    >
      <TextField
        label="Name"
        id="popup-name"
        description="For the dashboard only; shoppers never see it."
        error={errors.name}
        {...register("name")}
      />
      <FormField
        label="Image"
        htmlFor="popup-image"
        description="Optional. Uploaded when you save."
        error={imageError ? { message: imageError } : undefined}
      >
        <ImagePicker
          key={removeImage ? "removed" : "kept"}
          id="popup-image"
          src={removeImage ? null : popup?.image}
          onSelect={(file) => {
            setImageFile(file)
            setRemoveImage(false)
            setImageError(null)
          }}
          onRemove={
            imageFile || (popup?.image && !removeImage)
              ? () => {
                  setImageFile(null)
                  setRemoveImage(true)
                }
              : undefined
          }
        />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Title (English)" id="popup-title-en" error={errors.title_en} {...register("title_en")} />
        <TextField
          label="Title (Bangla)"
          id="popup-title-bn"
          lang="bn"
          error={errors.title_bn}
          {...register("title_bn")}
        />
        <TextareaField label="Text (English)" id="popup-body-en" rows={2} error={errors.body_en} {...register("body_en")} />
        <TextareaField
          label="Text (Bangla)"
          id="popup-body-bn"
          lang="bn"
          rows={2}
          error={errors.body_bn}
          {...register("body_bn")}
        />
        <TextField
          label="Button (English)"
          id="popup-cta-en"
          placeholder="Shop now"
          error={errors.cta_label_en}
          {...register("cta_label_en")}
        />
        <TextField
          label="Button (Bangla)"
          id="popup-cta-bn"
          lang="bn"
          error={errors.cta_label_bn}
          {...register("cta_label_bn")}
        />
      </div>
      <TextField
        label="Button link"
        id="popup-cta-url"
        placeholder="/shop?sale=eid"
        description="A site path like /shop, or a full https:// address. Leave empty for no button."
        error={errors.cta_url}
        {...register("cta_url")}
      />
      {isShop && (
        <SelectField
          control={control}
          name="sale_id"
          label="Sale"
          placeholder="Choose the sale"
          options={options}
          description="The popup shows only while this sale runs, and only products it discounts."
        />
      )}
      <Controller
        control={control}
        name="products"
        render={({ field }) => (
          <FormField
            label={`Products${field.value.length ? ` (${field.value.length}/${MAX_PRODUCTS})` : ""}`}
            description={
              isShop
                ? "Optional. Stock products the sale covers, shown as cards in this order."
                : "Optional. Pre-order products, shown as cards in this order while they are open for pre-order."
            }
            error={errors.products as { message?: string } | undefined}
          >
            <div className="flex flex-col items-start gap-2">
              {field.value.length > 0 && (
                <ul className="w-full divide-y divide-border rounded-lg border border-field-border">
                  {field.value.map((product) => (
                    <li key={product.id} className="flex items-center gap-3 px-3 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-sm">{product.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${product.name}`}
                        onClick={() => field.onChange(field.value.filter((p) => p.id !== product.id))}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {field.value.length < MAX_PRODUCTS && (
                <Button type="button" variant="outline" onClick={() => setPicking(true)}>
                  <PlusIcon className="size-4" /> Add product
                </Button>
              )}
            </div>
            <ProductPickerDialog
              open={picking}
              onOpenChange={setPicking}
              kind={isShop ? "stock" : "preorder"}
              title="Feature a product"
              onPick={(product) => {
                if (!field.value.some((p) => p.id === product.id)) {
                  field.onChange([...field.value, { id: product.id, name: product.name }])
                }
                setPicking(false)
              }}
            />
          </FormField>
        )}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DateField withTime label="Shown from" id="popup-starts" error={errors.starts_at} {...register("starts_at")} />
        <DateField withTime label="Shown until" id="popup-ends" error={errors.ends_at} {...register("ends_at")} />
      </div>
      <TextField
        label="Priority"
        id="popup-priority"
        type="number"
        min={0}
        step={1}
        description="When several popups could show, the highest number wins."
        error={errors.priority}
        {...register("priority")}
      />
      <SwitchField control={control} name="is_active" label="On" description="A popup that is off never shows." />
    </FormDialog>
  )
}
