import { useEffect, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Megaphone, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { DataTable } from "@/components/common/data-table"
import { TableActions } from "@/components/common/TableActions"
import { ProductCell, TextCell } from "@/components/common/cells"
import { FormDialog, SwitchField } from "@/components/common/FormDialog"
import { SelectField, TextField } from "@/components/common/form-fields"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { deletePromoLine, fetchPromoLines, savePromoLine } from "@/features/system/slices/businessSettingsSlice"
import type { HeroSlidePlacement, PromoLine } from "@/features/system/types"
import { getApiErrorMessage } from "@/lib/api/client"
import { reportFormError } from "@/lib/forms"
import type { Option } from "@/lib/types"

const PLACEMENT_LABEL: Record<HeroSlidePlacement, string> = {
  home: "Home",
  preorder: "Pre-order",
  both: "Both",
}
const placementOptions: Option[] = Object.entries(PLACEMENT_LABEL).map(([value, label]) => ({ value, label }))

export function PromoLinesCard({ canManage }: { canManage: boolean }) {
  const dispatch = useAppDispatch()
  const { data, status, error } = useAppSelector((state) => state.businessSettings.promoLines)
  const [saving, setSaving] = useState<string | null>(null)
  const [editing, setEditing] = useState<PromoLine | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const toggle = async (line: PromoLine, is_active: boolean) => {
    setSaving(line.id)
    try {
      await dispatch(savePromoLine({ id: line.id, values: { is_active } })).unwrap()
      toast.success(`Promo line ${is_active ? "shown" : "hidden"}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't update the promo line"))
    } finally {
      setSaving(null)
    }
  }

  const handleDelete = async (line: PromoLine) => {
    try {
      await dispatch(deletePromoLine(line.id)).unwrap()
      toast.success("Promo line deleted")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete promo line"))
    }
  }

  const columns: ColumnDef<PromoLine>[] = [
    {
      id: "text",
      header: "LINE",
      cell: ({ row }) => (
        <ProductCell name={row.original.text_en} sub={<span lang="bn">{row.original.text_bn}</span>} />
      ),
    },
    {
      accessorKey: "placement",
      header: "PAGE",
      cell: ({ row }) => <TextCell value={PLACEMENT_LABEL[row.original.placement] ?? row.original.placement} />,
    },
    {
      accessorKey: "sort_order",
      header: "ORDER",
      cell: ({ row }) => <TextCell value={row.original.sort_order} />,
    },
    {
      id: "active",
      header: "ACTIVE",
      cell: ({ row }) => (
        <Switch
          aria-label={`Show "${row.original.text_en}" on the storefront`}
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
                itemName={row.original.text_en}
                onEdit={() => {
                  setEditing(row.original)
                  setFormOpen(true)
                }}
                onDelete={() => handleDelete(row.original)}
              />
            ),
          } satisfies ColumnDef<PromoLine>,
        ]
      : []),
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Promo Lines</CardTitle>
        <CardDescription>
          The short messages in the strip above the storefront header, per page. A page shows its built-in lines until
          at least one active line is placed on it.
        </CardDescription>
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
              Add line
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
          onRetry={() => dispatch(fetchPromoLines())}
          emptyIcon={Megaphone}
          emptyTitle="No promo lines"
          emptyDescription="The storefront is showing its built-in lines."
          minWidth="620px"
          columnWidths={["auto", "110px", "90px", "90px", ...(canManage ? ["80px"] : [])]}
          unlabelledColumns={["actions"]}
        />
      </CardContent>

      {canManage && (
        <PromoLineFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          line={editing}
          nextSortOrder={data.length ? Math.max(...data.map((l) => l.sort_order)) + 1 : 0}
        />
      )}
    </Card>
  )
}

const schema = z.object({
  text_en: z.string().trim().min(1, "English text is required"),
  text_bn: z.string().trim(),
  placement: z.enum(["home", "preorder", "both"]),
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
    defaultValues: { text_en: "", text_bn: "", placement: "both", sort_order: "0", is_active: true },
  })

  useEffect(() => {
    if (!open) return
    reset({
      text_en: line?.text_en ?? "",
      text_bn: line?.text_bn ?? "",
      placement: line?.placement ?? "both",
      sort_order: String(line?.sort_order ?? nextSortOrder),
      is_active: line?.is_active ?? true,
    })
  }, [open, line, nextSortOrder, reset])

  const onSubmit = async (values: FormValues) => {
    try {
      await dispatch(
        savePromoLine({ id: line?.id, values: { ...values, sort_order: Number(values.sort_order) } })
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
      <SelectField control={control} name="placement" label="Page" id="promo-placement" options={placementOptions} />
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
      <SwitchField control={control} name="is_active" label="Active" description="Inactive lines stay off the storefront." />
    </FormDialog>
  )
}
