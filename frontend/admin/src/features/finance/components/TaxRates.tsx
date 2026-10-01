import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import type { ColumnDef } from "@tanstack/react-table"
import { CheckCircle2, Loader2, Percent, Plus, Star } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { TableActions } from "@/components/common/TableActions"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeading } from "@/components/common/PageHeading"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"

import { deleteData, fetchAll, patchData, postData, restoreTaxRate } from "../slices/taxRateSlice"
import type { TaxRate, TaxRatePayload } from "../types"
import { useCan, useDebouncedValue } from "../hooks/useFinanceHelpers"
import { RestoreButton, ShowDeletedToggle } from "./shared"

const PAGE_SIZE = 20

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
      for (const [field, message] of Object.entries(getApiFieldErrors(err))) {
        if (field in schema.shape) setError(field as keyof FormValues, { message })
      }
      toast.error(getApiErrorMessage(err, "Failed to save tax rate"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{taxRate ? "Edit Tax Rate" : "New Tax Rate"}</DialogTitle>
          <DialogDescription>Tax rates applied at checkout and posted to Tax Payable.</DialogDescription>
        </DialogHeader>
        <form id="tax-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 py-2">
          <Field>
            <FieldLabel htmlFor="tax-name">Name *</FieldLabel>
            <FieldContent>
              <Input id="tax-name" placeholder="e.g. VAT 7.5%" aria-invalid={!!errors.name} {...register("name")} />
              <FieldError errors={[errors.name]} />
            </FieldContent>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="tax-rate">Rate (%) *</FieldLabel>
              <FieldContent>
                <Input
                  id="tax-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  aria-invalid={!!errors.rate_percent}
                  {...register("rate_percent")}
                />
                <FieldError errors={[errors.rate_percent]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="tax-region">Region</FieldLabel>
              <FieldContent>
                <Input id="tax-region" placeholder="e.g. Bangladesh" {...register("region")} />
                <FieldError errors={[errors.region]} />
              </FieldContent>
            </Field>
          </div>
          {taxRate && (
            <div className="space-y-3">
              <Controller
                control={control}
                name="is_active"
                render={({ field }) => (
                  <div className="flex items-center gap-3">
                    <Switch id="tax-active" checked={field.value} onCheckedChange={field.onChange} />
                    <label htmlFor="tax-active" className="text-sm">
                      Active
                    </label>
                  </div>
                )}
              />
              <Controller
                control={control}
                name="is_default"
                render={({ field }) => (
                  <Field>
                    <div className="flex items-center gap-3">
                      <Switch id="tax-default" checked={field.value} onCheckedChange={field.onChange} />
                      <label htmlFor="tax-default" className="text-sm">
                        Default tax rate
                      </label>
                    </div>
                    <FieldDescription>Only an active rate can be the default; setting it replaces the current default.</FieldDescription>
                  </Field>
                )}
              />
            </div>
          )}
        </form>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="tax-form" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
            {taxRate ? "Save Changes" : "Create Tax Rate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const IMPORT_FIELDS: ImportField[] = [
  { key: "name", label: "Name", required: true, aliases: ["Tax name"], example: "VAT 15%" },
  { key: "rate_percent", label: "Rate (%)", required: true, type: "number", aliases: ["Rate", "Rate percent", "Percent"], example: "15" },
  { key: "region", label: "Region", example: "Bangladesh" },
]

const TaxRates = () => {
  useDocumentTitle("Tax Rates")
  const dispatch = useAppDispatch()
  const { data, isFetchingList, error, totalItems, meta } = useAppSelector((state) => state.taxRates)
  const canPost = useCan("accounting.post")

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search)
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TaxRate | null>(null)

  const load = useCallback(
    () =>
      dispatch(
        fetchAll({
          page,
          page_size: PAGE_SIZE,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(includeDeleted ? { include_deleted: "true" } : {}),
        })
      ),
    [dispatch, page, debouncedSearch, includeDeleted]
  )

  useEffect(() => {
    const request = load()
    return () => request.abort()
  }, [load])

  const handleDelete = async (rate: TaxRate) => {
    try {
      await dispatch(deleteData(rate.id)).unwrap()
      toast.success("Tax rate deleted")
      if (includeDeleted) load()
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
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.region || "—"}</span>,
    },
    {
      id: "status",
      header: "STATUS",
      cell: ({ row }) =>
        row.original.deleted_at ? (
          <StatusBadge status="deleted" tone="destructive" />
        ) : (
          <StatusBadge status={row.original.is_active ? "active" : "inactive"} />
        ),
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => {
        const rate = row.original
        if (!canPost) return null
        if (rate.deleted_at) return <RestoreButton label={rate.name} onClick={() => handleRestore(rate)} />
        return (
          <TableActions
            itemName={rate.name}
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
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Tax Rates" description="Rates charged on orders. The starred rate is the store default." />
        {canPost && (
          <div className="flex flex-wrap items-center gap-3">
            <CsvImportButton
              entityName="tax rates"
              fields={IMPORT_FIELDS}
              createRow={(payload) => dispatch(postData({ payload: payload as Partial<TaxRate> })).unwrap()}
              onComplete={() => {
                load()
              }}
            />
            <Button
              size="action"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="size-5" /> New Tax Rate
            </Button>
          </div>
        )}
      </div>

      <FilterToolbar
        searchPlaceholder="Search name or region..."
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        filters={
          canPost
            ? [
                {
                  component: (
                    <ShowDeletedToggle
                      id="tax-deleted"
                      checked={includeDeleted}
                      onCheckedChange={(v) => {
                        setIncludeDeleted(v)
                        setPage(1)
                      }}
                    />
                  ),
                },
              ]
            : []
        }
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={isFetchingList}
        error={error}
        onRetry={() => {
          load()
        }}
        manualPagination
        pageSize={PAGE_SIZE}
        pageIndex={page - 1}
        pageCount={meta?.totalPages ?? 1}
        totalCount={totalItems}
        onPageChange={(index) => setPage(index + 1)}
        emptyIcon={Percent}
        emptyTitle="No tax rates"
        minWidth="720px"
        columnWidths={["260px", "100px", "180px", "110px", "110px"]}
      />

      {/* Setting a new default clears the old one server-side, so refetch the page after saves. */}
      <TaxRateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        taxRate={editing}
        onSaved={() => {
          load()
        }}
      />
    </div>
  )
}

export default TaxRates
