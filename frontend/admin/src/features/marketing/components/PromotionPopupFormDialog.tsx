import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { ImageIcon, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Thumbnail } from "@/components/common/cells"
import { FormDialog, SwitchField } from "@/components/common/FormDialog"
import { DateField, FormField, SelectField, TextField } from "@/components/common/form-fields"
import { ImagePicker } from "@/components/common/ImagePicker"

import { useAppDispatch } from "@/app/hooks"
import { CategoryTreeCombobox } from "@/features/catalog/components/CategoryTreeSelect"
import { ProductPickerDialog } from "@/features/catalog/components/ProductPickerDialog"
import { useCategoryOptions } from "@/features/catalog/lib/useCategoryOptions"
import type { Sale } from "@/features/marketing/types"
import { savePromotionPopup } from "@/features/system/slices/businessSettingsSlice"
import type { PopupDestination, PopupShop, PromotionPopup } from "@/features/system/types"
import { api, getApiFieldErrors } from "@/lib/api/client"
import { unwrapList } from "@/lib/api/envelope"
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/format"
import { reportFormError } from "@/lib/forms"
import { SHOP_COPY } from "../lib/promotionPopups"

const DESTINATION_OPTIONS: { value: PopupDestination; label: string }[] = [
  { value: "none", label: "No link" },
  { value: "product", label: "Product" },
  { value: "category", label: "Category" },
  { value: "campaign", label: "Campaign page (a sale's products)" },
  { value: "url", label: "Custom URL" },
]

/** Sales are stock only, so a pre-order popup cannot lead to a campaign page. */
const destinationOptions = (shop: PopupShop) =>
  shop === "preorder" ? DESTINATION_OPTIONS.filter((option) => option.value !== "campaign") : DESTINATION_OPTIONS

/** The rule validate_site_link in api/v1/admin/business/serializers.py enforces: a site path or an http(s) URL. */
const isSiteLink = (value: string) => !value || /^https?:\/\/\S+$/i.test(value) || /^\/(?![/\\])/.test(value)

const PRIORITY_MESSAGE = "A whole number from 0 to 1000"

const schema = z
  .object({
    name: z.string().trim().min(1, "Enter the campaign name").max(120, "At most 120 characters"),
    is_active: z.boolean(),
    priority: z
      .string()
      .trim()
      .regex(/^\d+$/, PRIORITY_MESSAGE)
      .refine((value) => Number(value) <= 1000, PRIORITY_MESSAGE),
    starts_at: z.string(),
    ends_at: z.string(),
    destination_type: z.enum(["none", "product", "category", "campaign", "url"]),
    product: z.object({ id: z.string(), name: z.string(), slug: z.string(), image: z.string().nullable() }).nullable(),
    category_id: z.string(),
    sale_id: z.string(),
    link_url: z.string().trim().refine(isSiteLink, "A site path like /shop, or a full https:// address"),
  })
  .superRefine((values, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message })
    if (values.starts_at && values.ends_at && values.ends_at <= values.starts_at) {
      issue("ends_at", "The end must be after the start")
    }
    if (values.destination_type === "product" && !values.product) issue("product", "Choose the product")
    if (values.destination_type === "category" && !values.category_id) issue("category_id", "Choose the category")
    if (values.destination_type === "campaign" && !values.sale_id) issue("sale_id", "Choose the campaign")
    if (values.destination_type === "url" && !values.link_url) issue("link_url", "Enter the URL")
  })
type FormValues = z.infer<typeof schema>

const EMPTY: FormValues = {
  name: "",
  is_active: true,
  priority: "0",
  starts_at: "",
  ends_at: "",
  destination_type: "none",
  product: null,
  category_id: "",
  sale_id: "",
  link_url: "",
}

const FORM_FIELDS = Object.keys(EMPTY)

const valuesOf = (popup: PromotionPopup): FormValues => ({
  name: popup.name,
  is_active: popup.is_active,
  priority: String(popup.priority),
  starts_at: toDatetimeLocal(popup.starts_at),
  ends_at: toDatetimeLocal(popup.ends_at),
  destination_type: popup.destination_type,
  product: popup.product
    ? { id: popup.product.id, name: popup.product.name, slug: popup.product.slug, image: popup.product.image }
    : null,
  category_id: popup.category?.id ?? "",
  sale_id: popup.sale?.id ?? "",
  link_url: popup.link_url,
})

/** Every sale, for the dropdown; the status is shown so a scheduled or ended one is chosen knowingly. */
function useSaleOptions(enabled: boolean, own: PromotionPopup["sale"]) {
  const [sales, setSales] = useState<Sale[]>([])
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    api
      .get("/admin/sales/", { params: { page: 1, page_size: 100 }, signal: controller.signal })
      .then((res) => setSales(unwrapList<Sale>(res.data).items))
      .catch(() => {
        if (!controller.signal.aborted) toast.error("Couldn't load the sales")
      })
    return () => controller.abort()
  }, [enabled])
  const options = sales.map((sale) => ({
    value: sale.id,
    label: `${sale.name} — ${Number(sale.percent_off)}% (${sale.status})`,
  }))
  // The popup's own sale stays choosable even if the list has not loaded it (more than 100 sales).
  return own && !options.some((option) => option.value === own.id)
    ? [{ value: own.id, label: `${own.name} — ${Number(own.percent_off)}%` }, ...options]
    : options
}

/** The shop's categories in tree order, with their depth so the picker indents subcategories. */
function useCategorySelectOptions(shop: PopupShop, saved: PromotionPopup["category"]) {
  const { options } = useCategoryOptions(shop)
  return useMemo(() => {
    const rows = options.map((option) => ({ value: option.value, label: option.label, depth: option.depth }))
    // A saved category that is no longer listed (switched off) stays choosable.
    return saved && !rows.some((row) => row.value === saved.id)
      ? [{ value: saved.id, label: saved.name, depth: 0 }, ...rows]
      : rows
  }, [options, saved])
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  )
}

/**
 * Add / edit a promotion popup of `shop`, in a dialog over the popup list. `popup` null adds one.
 * Without manage permission the form is read-only.
 */
export function PromotionPopupFormDialog({
  open,
  onOpenChange,
  popup,
  shop,
  readOnly,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  popup: PromotionPopup | null
  shop: PopupShop
  readOnly: boolean
}) {
  const dispatch = useAppDispatch()
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [pickingProduct, setPickingProduct] = useState(false)
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY })
  const destination = useWatch({ control, name: "destination_type" })
  const sales = useSaleOptions(open && destination === "campaign", popup?.sale ?? null)
  const categoryOptions = useCategorySelectOptions(shop, popup?.category ?? null)

  // Filled when the dialog opens, in an effect: resetting while rendering updates the Controllers mid-render.
  useEffect(() => {
    if (!open) return
    reset(popup ? valuesOf(popup) : EMPTY)
  }, [open, popup, reset])

  const close = (next: boolean) => {
    if (!next) {
      setImageFile(null)
      setImageError(null)
    }
    onOpenChange(next)
  }

  const onSubmit = async (values: FormValues) => {
    if (!popup && !imageFile) {
      setImageError("Choose the popup image")
      return
    }
    const type = values.destination_type
    try {
      await dispatch(
        savePromotionPopup({
          id: popup?.id,
          values: {
            name: values.name.trim(),
            is_active: values.is_active,
            priority: Number(values.priority),
            starts_at: fromDatetimeLocal(values.starts_at),
            ends_at: fromDatetimeLocal(values.ends_at),
            // The shop is fixed once the popup exists.
            ...(popup ? {} : { shop }),
            destination_type: type,
            // Only the destination matching the type is kept; the others are cleared.
            product_id: type === "product" ? (values.product?.id ?? null) : null,
            category_id: type === "category" ? values.category_id : null,
            sale_id: type === "campaign" ? values.sale_id : null,
            link_url: type === "url" ? values.link_url : "",
          },
          image: imageFile,
        })
      ).unwrap()
      toast.success(`Popup ${popup ? "updated" : "added"}`)
      close(false)
    } catch (err) {
      const fieldErrors = getApiFieldErrors(err)
      if (fieldErrors.image) setImageError(fieldErrors.image)
      if (fieldErrors.product_id) setError("product", { message: fieldErrors.product_id })
      reportFormError(err, { setError, fields: FORM_FIELDS, fallback: "Failed to save popup" })
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      size="lg"
      title={
        <span className="text-xl font-semibold">
          {readOnly ? "Popup details" : popup ? "Edit popup" : "Add popup"}
        </span>
      }
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={popup ? "Save popup" : "Add popup"}
      submitDisabled={readOnly}
    >
      <fieldset disabled={readOnly} className="space-y-4">
        <Section title="Campaign information">
          <TextField
            label="Campaign name"
            id="popup-name"
            placeholder="e.g. October Gadget Sale"
            error={errors.name}
            {...register("name")}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SwitchField
              control={control}
              name="is_active"
              label="Status"
              onLabel="Active"
              offLabel="Inactive"
              disabled={readOnly}
            />
            <TextField
              label={
                <>
                  Priority <span className="font-normal text-muted-foreground">(highest priority wins)</span>
                </>
              }
              id="popup-priority"
              type="number"
              min={0}
              max={1000}
              error={errors.priority}
              {...register("priority")}
            />
          </div>
        </Section>

        <Section title="Display schedule">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DateField
              label="Start date and time"
              id="popup-starts-at"
              withTime
              error={errors.starts_at}
              {...register("starts_at")}
            />
            <DateField
              label="End date and time"
              id="popup-ends-at"
              withTime
              error={errors.ends_at}
              {...register("ends_at")}
            />
          </div>
        </Section>

        <Section title="Destination">
          <SelectField
            control={control}
            name="destination_type"
            label="Destination type"
            disabled={readOnly}
            options={destinationOptions(shop)}
            description="Optional. Where shoppers go when they click the image; No link shows the image alone."
          />
          {destination === "product" && (
            <Controller
              control={control}
              name="product"
              render={({ field, fieldState }) => (
                <FormField label="Product" error={fieldState.error}>
                  {field.value ? (
                    <div className="flex items-center gap-3 rounded-lg border border-field-border p-2.5">
                      <Thumbnail src={field.value.image} icon={ImageIcon} className="size-12" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{field.value.name}</p>
                        <p className="truncate text-xs text-muted-foreground">/product/{field.value.slug}</p>
                      </div>
                      {!readOnly && (
                        <div className="flex shrink-0 gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setPickingProduct(true)}>
                            Change
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                            onClick={() => field.onChange(null)}
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => setPickingProduct(true)}
                      className="flex w-full items-center gap-3 rounded-lg border border-dashed border-field-border p-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50 disabled:cursor-not-allowed"
                    >
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Package className="size-5" />
                      </span>
                      Choose a {SHOP_COPY[shop].label} product
                    </button>
                  )}
                  <ProductPickerDialog
                    open={pickingProduct}
                    onOpenChange={setPickingProduct}
                    kind={shop}
                    title={`Choose a ${SHOP_COPY[shop].label} product`}
                    onPick={(product) => {
                      // The picked product's photo shows in the tile before the popup is saved.
                      field.onChange({
                        id: product.id,
                        name: product.name,
                        slug: product.slug,
                        image: product.primary_image ?? null,
                      })
                      setPickingProduct(false)
                    }}
                  />
                </FormField>
              )}
            />
          )}
          {destination === "category" && (
            <FormField label="Category" htmlFor="popup-category" error={errors.category_id}>
              <CategoryTreeCombobox
                control={control}
                name="category_id"
                id="popup-category"
                placeholder="Search categories"
                options={categoryOptions}
                disabled={readOnly}
              />
            </FormField>
          )}
          {destination === "campaign" && (
            <SelectField
              control={control}
              name="sale_id"
              label="Campaign"
              placeholder="Choose the sale"
              disabled={readOnly}
              options={sales}
              description="Opens the products on sale. The popup shows only while this sale runs."
            />
          )}
          {destination === "url" && (
            <TextField
              label="Destination URL"
              id="popup-link"
              placeholder="/shop?collection=sale"
              description="A site path like /product/… or a full https:// address."
              error={errors.link_url}
              {...register("link_url")}
            />
          )}
          <FormField
            label="Image"
            htmlFor="popup-image"
            error={imageError ? { message: imageError } : undefined}
          >
            <ImagePicker
              id="popup-image"
              src={popup?.image}
              onSelect={(file) => {
                setImageFile(file)
                setImageError(null)
              }}
            />
          </FormField>
        </Section>
      </fieldset>
    </FormDialog>
  )
}
