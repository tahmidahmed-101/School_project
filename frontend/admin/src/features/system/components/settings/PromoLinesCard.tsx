import { useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Megaphone } from "lucide-react"
import { ProductCell } from "@/components/common/cells"
import { FormDialog, SwitchField } from "@/components/common/FormDialog"
import { TextField } from "@/components/common/form-fields"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { deletePromoLine, fetchPromoLines, savePromoLine } from "@/features/system/slices/businessSettingsSlice"
import type { PromoLine } from "@/features/system/types"
import { reportFormError } from "@/lib/forms"
import { ContentListCard } from "./ContentListCard"
import { onShop } from "./placement"

export function PromoLinesCard({ canManage }: { canManage: boolean }) {
  const dispatch = useAppDispatch()
  const { data: allLines, status, error } = useAppSelector((state) => state.businessSettings.promoLines)
  const data = useMemo(() => onShop(allLines), [allLines])

  return (
    <ContentListCard<PromoLine>
      title="Promo Lines"
      description="The short messages in the strip above the storefront header. The storefront shows its built-in lines until at least one active line exists."
      addLabel="Add line"
      canManage={canManage}
      items={data}
      status={status}
      error={error}
      onRetry={() => dispatch(fetchPromoLines())}
      contentColumn={{
        id: "text",
        header: "LINE",
        cell: ({ row }) => (
          <ProductCell name={row.original.text_en} sub={<span lang="bn">{row.original.text_bn}</span>} />
        ),
      }}
      itemName={(line) => line.text_en}
      switchLabel={(line) => `Show "${line.text_en}" on the storefront`}
      onToggle={(line, is_active) => dispatch(savePromoLine({ id: line.id, values: { is_active } })).unwrap()}
      toggledMessage={(_line, isActive) => `Promo line ${isActive ? "shown" : "hidden"}`}
      toggleError="Couldn't update the promo line"
      onDelete={(line) => dispatch(deletePromoLine(line.id)).unwrap()}
      deletedMessage={() => "Promo line deleted"}
      deleteError="Failed to delete promo line"
      emptyIcon={Megaphone}
      emptyTitle="No promo lines"
      emptyDescription="The built-in lines are showing."
      renderForm={(form) => (
        <PromoLineFormDialog
          open={form.open}
          onOpenChange={form.onOpenChange}
          line={form.editing}
          nextSortOrder={form.nextSortOrder}
        />
      )}
    />
  )
}

const schema = z.object({
  text_en: z.string().trim().min(1, "English text is required"),
  text_bn: z.string().trim(),
  sort_order: z.string().trim().regex(/^\d+$/, "Enter a whole number"),
  is_active: z.boolean(),
})
type FormValues = z.infer<typeof schema>

function PromoLineFormDialog({
  open,
  onOpenChange,
  line,
  nextSortOrder,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  line: PromoLine | null
  nextSortOrder: number
}) {
  const dispatch = useAppDispatch()
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { text_en: "", text_bn: "", sort_order: "0", is_active: true },
  })

  useEffect(() => {
    if (!open) return
    reset({
      text_en: line?.text_en ?? "",
      text_bn: line?.text_bn ?? "",
      sort_order: String(line?.sort_order ?? nextSortOrder),
      is_active: line?.is_active ?? true,
    })
  }, [open, line, nextSortOrder, reset])

  const onSubmit = async (values: FormValues) => {
    try {
      await dispatch(
        savePromoLine({
          id: line?.id,
          values: { ...values, ...(line ? {} : { placement: "home" }), sort_order: Number(values.sort_order) },
        })
      ).unwrap()
      toast.success(`Promo line ${line ? "updated" : "added"}`)
      onOpenChange(false)
    } catch (err) {
      reportFormError(err, { setError, fields: Object.keys(values), fallback: "Failed to save promo line" })
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={line ? "Edit promo line" : "Add promo line"}
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={line ? "Save line" : "Add line"}
    >
      <TextField label="Text (English)" id="promo-text-en" error={errors.text_en} {...register("text_en")} />
      <TextField label="Text (Bangla)" id="promo-text-bn" lang="bn" error={errors.text_bn} {...register("text_bn")} />
      <TextField
        label="Sort order"
        id="promo-sort-order"
        type="number"
        min={0}
        step={1}
        description="Lower numbers come first."
        error={errors.sort_order}
        {...register("sort_order")}
      />
      <SwitchField control={control} name="is_active" label="Status" onLabel="Active" offLabel="Inactive" description="Inactive lines stay off the storefront." />
    </FormDialog>
  )
}
