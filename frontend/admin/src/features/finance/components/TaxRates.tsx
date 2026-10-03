import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { ColumnDef } from "@tanstack/react-table"
import { Percent, Plus, Star } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { TableActions } from "@/components/common/TableActions"
import { PageHeader } from "@/components/common/PageHeader"
import { FormDialog, SwitchField } from "@/components/common/FormDialog"
import { ActiveStatusBadge, TextCell } from "@/components/common/cells"
import { TextField } from "@/components/common/form-fields"
import { getApiErrorMessage } from "@/lib/api/client"
import { reportFormError } from "@/lib/forms"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { useListPage } from "@/hooks/use-list-page"

import { deleteData, fetchAll, patchData, postData, restoreTaxRate } from "../slices/taxRateSlice"
import type { TaxRate, TaxRatePayload } from "../types"

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  rate_percent: z
    .string()
    .min(1, "Rate is required")
    .refine((v) => Number(v) >= 0 && Number(v) < 1000, "Enter a valid percentage"),
  region: z.string(),
  is_active: z.boolean(),
  is_default: z.boolean(),
})
type FormValues = z.infer<typeof schema>

function TaxRateFormDialog({
  open,
  onOpenChange,
  taxRate,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  taxRate: TaxRate | null
  onSaved: () => void
}) {
  const dispatch = useAppDispatch()
  const {
    control,
    register,
    reset,
    setError,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (open) {
      reset({
        name: taxRate?.name ?? "",
        rate_percent: taxRate?.rate_percent ?? "",
        region: taxRate?.region ?? "",
        is_active: taxRate?.is_active ?? true,
        is_default: taxRate?.is_default ?? false,
      })
    }
  }, [open, taxRate, reset])

  const onSubmit = async (values: FormValues) => {
    const payload: TaxRatePayload = {
      name: values.name.trim(),
      rate_percent: values.rate_percent,
      region: values.region.trim(),
      ...(taxRate ? { is_active: values.is_active } : {}),
      ...(taxRate && values.is_default !== taxRate.is_default ? { is_default: values.is_default } : {}),
    }
    try {
      if (taxRate) {
        await dispatch(patchData({ id: taxRate.id, payload: payload as Partial<TaxRate> })).unwrap()
        toast.success("Tax rate updated")
      } else {
        await dispatch(postData({ payload: payload as Partial<TaxRate> })).unwrap()
        toast.success("Tax rate created")
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      reportFormError(err, { setError, fields: Object.keys(schema.shape), fallback: "Failed to save tax rate" })
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={taxRate ? "Edit Tax Rate" : "New Tax Rate"}
      description="Tax rates applied at checkout and posted to Tax Payable."
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={taxRate ? "Save Changes" : "Create Tax Rate"}
    >
      <TextField label="Name *" id="tax-name" placeholder="e.g. VAT 7.5%" error={errors.name} {...register("name")} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField
          label="Rate (%) *"
          id="tax-rate"
          type="number"
          step="0.01"
          min="0"
          error={errors.rate_percent}
          {...register("rate_percent")}
        />
        <TextField
          label="Region"
          id="tax-region"
          placeholder="e.g. Bangladesh"
          error={errors.region}
          {...register("region")}
        />
      </div>
      {taxRate && (
        <div className="space-y-3">
          <SwitchField control={control} name="is_active" label="Active" />
          <SwitchField
            control={control}
            name="is_default"
            label="Default tax rate"
            description="Only an active rate can be the default; setting it replaces the current default."
          />
        </div>
      )}
    </FormDialog>
  )
}

const TaxRates = () => {
  useDocumentTitle("Tax Rates")
  const dispatch = useAppDispatch()
  const listState = useAppSelector((state) => state.taxRates)
  const canPost = useCan("accounting.post")

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TaxRate | null>(null)

  const list = useListPage({ fetch: (params) => dispatch(fetchAll(params)), state: listState })

  const setActive = (rows: TaxRate[], is_active: boolean) =>
    Promise.all(
      rows.map((r) => dispatch(patchData({ id: r.id, payload: { is_active } as Partial<TaxRate> })).unwrap())
    )

  const handleDelete = async (rate: TaxRate) => {
    try {
      await dispatch(deleteData(rate.id)).unwrap()
      toast.success("Tax rate deleted")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete tax rate"))
    }
  }

  const handleRestore = async (rate: TaxRate) => {
    try {
      await dispatch(restoreTaxRate(rate.id)).unwrap()
      toast.success("Tax rate restored")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to restore tax rate"))
    }
  }

  const columns: ColumnDef<TaxRate>[] = [
    {
      accessorKey: "name",
      header: "NAME",
      cell: ({ row }) => (
        <span className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
          {row.original.name}
          {row.original.is_default && (
            <Star className="size-3.5 fill-amber-400 text-amber-400" aria-label="Default tax rate" />
          )}
        </span>
      ),
    },
    {
      accessorKey: "rate_percent",
      header: "RATE",
      cell: ({ row }) => <span className="text-sm font-semibold">{Number(row.original.rate_percent).toFixed(2)}%</span>,
    },
    {
      accessorKey: "region",
      header: "REGION",
      cell: ({ row }) => <TextCell value={row.original.region} muted />,
    },
    {
      id: "status",
      header: "STATUS",
      cell: ({ row }) => <ActiveStatusBadge deleted={row.original.deleted_at} active={row.original.is_active} />,
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => {
        const rate = row.original
        if (!canPost) return null
        return (
          <TableActions
            itemName={rate.name}
            deleted={!!rate.deleted_at}
            onRestore={() => handleRestore(rate)}
            onEdit={() => {
              setEditing(rate)
              setFormOpen(true)
            }}
            onDelete={() => handleDelete(rate)}
          />
        )
      },
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Tax Rates"
        actions={
          canPost && (
            <Button
              size="action"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="size-5" /> New Tax Rate
            </Button>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search name or region..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
      />

      <DataTable
        columns={columns}
        bulk={
          canPost
            ? {
                noun: "tax rate",
                deleteRow: (r) => dispatch(deleteData(r.id)).unwrap(),
                activate: (rows) => setActive(rows, true),
                deactivate: (rows) => setActive(rows, false),
                onDone: () => {
                  list.reload()
                },
              }
            : undefined
        }
        data={listState.data}
        {...list.tableProps}
        emptyIcon={Percent}
        emptyTitle="No tax rates"
        minWidth="720px"
        columnWidths={["260px", "100px", "180px", "110px", "80px"]}
      />

      {/* Setting a new default clears the old one server-side, so refetch the page after saves. */}
      <TaxRateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        taxRate={editing}
        onSaved={list.reload}
      />
    </div>
  )
}

export default TaxRates
