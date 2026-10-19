import { useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { ImageIcon, Megaphone, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { DataTable } from "@/components/common/data-table"
import { TableActions } from "@/components/common/TableActions"
import { ProductCell, Thumbnail } from "@/components/common/cells"
import { StatusBadge } from "@/components/common/StatusBadge"
import type { StatusTone } from "@/components/common/status-tones"
import { FormDialog } from "@/components/common/FormDialog"
import { FormField, SelectField, TextField } from "@/components/common/form-fields"
import { ImagePicker } from "@/components/common/ImagePicker"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import type { Sale } from "@/features/marketing/types"
import {
  deletePromotionPopup,
  fetchPromotionPopups,
  savePromotionPopup,
} from "@/features/system/slices/businessSettingsSlice"
import type { PromotionPopup, ShopPlacement } from "@/features/system/types"
import { api, getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { unwrapList } from "@/lib/api/envelope"
import { reportFormError } from "@/lib/forms"

const CARD_COPY: Record<ShopPlacement, { title: string; description: string; noLink: string; example: string }> = {
  home: {
    title: "Promotion Popups",
    description:
      "An image that pops up on the shop home page while its sale runs. Clicking it opens the link, or the products on sale. When several could show, the newest wins.",
    noLink: "Opens the products on sale",
    example: "/shop?collection=sale",
  },
  preorder: {
    title: "Pre-order Popups",
    description:
      "An image that pops up on the pre-order page. Clicking it opens the link, or the pre-order products. When several could show, the newest wins.",
    noLink: "Opens the pre-order products",
    example: "/pre-order",
  },
}

/** What the storefront does with a popup right now. The server decides for real; this mirrors its rule. */
function popupState(popup: PromotionPopup): { label: string; tone: StatusTone } {
  if (!popup.is_active) return { label: "Off", tone: "secondary" }
  if (popup.sale && popup.sale.status !== "running") return { label: "Sale not running", tone: "warning" }
  return { label: "Live", tone: "success" }
}

const popupLabel = (popup: PromotionPopup) =>
  popup.sale ? `${popup.sale.name} · ${Number(popup.sale.percent_off)}%` : "Pre-order popup"

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
      toast.success(`Popup switched ${is_active ? "on" : "off"}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't update the popup"))
    } finally {
      setSaving(null)
    }
  }

  const handleDelete = async (popup: PromotionPopup) => {
    try {
      await dispatch(deletePromotionPopup(popup.id)).unwrap()
      toast.success("Popup deleted")
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
          <ProductCell name={popupLabel(row.original)} sub={row.original.link_url || CARD_COPY[placement].noLink} />
        </div>
      ),
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
          aria-label={`Switch ${popupLabel(row.original)} on`}
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
                itemName={popupLabel(row.original)}
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
          minWidth="560px"
          columnWidths={["auto", "130px", "70px", ...(canManage ? ["80px"] : [])]}
          unlabelledColumns={["actions"]}
        />
      </CardContent>

      {canManage && (
        <PromotionPopupFormDialog open={formOpen} onOpenChange={setFormOpen} popup={editing} placement={placement} />
      )}
    </Card>
  )
}

/** The rule validate_site_link in api/v1/admin/business/serializers.py enforces: a site path or an http(s) URL. */
const isSiteLink = (value: string) => !value || /^https?:\/\/\S+$/i.test(value) || /^\/(?![/\\])/.test(value)

const schema = z.object({
  link_url: z.string().trim().refine(isSiteLink, "A site path like /shop, or a full https:// address"),
  sale_id: z.string(),
})
type FormValues = z.infer<typeof schema>

const EMPTY: FormValues = { link_url: "", sale_id: "" }

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
  const copy = CARD_COPY[placement]
  const dispatch = useAppDispatch()
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
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
    reset(popup ? { link_url: popup.link_url, sale_id: popup.sale?.id ?? "" } : EMPTY)
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
      setImageError(null)
    }
    onOpenChange(next)
  }

  const onSubmit = async ({ link_url, sale_id }: FormValues) => {
    const needsSale = isShop && !sale_id
    const needsImage = !popup && !imageFile
    if (needsSale) setError("sale_id", { message: "Choose the sale" })
    if (needsImage) setImageError("Choose the popup image")
    if (needsSale || needsImage) return
    try {
      await dispatch(
        savePromotionPopup({
          id: popup?.id,
          values: {
            link_url,
            // Placement is fixed once created; a pre-order popup has no sale.
            ...(popup ? {} : { placement }),
            ...(isShop ? { sale_id } : {}),
          },
          image: imageFile,
        })
      ).unwrap()
      toast.success(`Popup ${popup ? "updated" : "added"}`)
      close(false)
    } catch (err) {
      const imageMessage = getApiFieldErrors(err).image
      if (imageMessage) setImageError(imageMessage)
      reportFormError(err, { setError, fields: ["link_url", "sale_id"], fallback: "Failed to save popup" })
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title={popup ? "Edit popup" : "Add popup"}
      description="The image is the whole popup. Shoppers click it to open the link."
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={popup ? "Save popup" : "Add popup"}
    >
      {isShop && (
        <SelectField
          control={control}
          name="sale_id"
          label="Sale"
          placeholder="Choose the sale"
          options={options}
          description="The popup shows only while this sale runs."
        />
      )}
      <FormField
        label="Image"
        htmlFor="popup-image"
        description="A portrait or square picture works best. Uploaded when you save."
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
      <TextField
        label="Link"
        id="popup-link"
        placeholder={copy.example}
        description={`Optional. A site path like /product/… or a full https:// address. Left empty, it ${copy.noLink.toLowerCase()}.`}
        error={errors.link_url}
        {...register("link_url")}
      />
    </FormDialog>
  )
}
