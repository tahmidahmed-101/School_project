import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import type { ColumnDef } from "@tanstack/react-table"
import { CheckCircle2, Loader2, Plus, RotateCcw, Truck } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { TableActions } from "@/components/common/TableActions"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeading } from "@/components/common/PageHeading"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { useAppDispatch } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"

import { deleteData, fetchAll, patchData, postData, restoreSupplier } from "../slices/supplierSlice"
import type { Supplier, SupplierPayload } from "../types"
import { useCanManagePurchasing, useDebouncedValue, useProcurementSelector } from "../hooks/useProcurement"
import { DeletedToggle } from "@/components/common/DeletedToggle"

const PAGE_SIZE = 20

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  contact_email: z.union([z.literal(""), z.email("Enter a valid email")]),
  phone: z.string(),
  payment_terms: z.string(),
  is_active: z.boolean(),
})
type FormValues = z.infer<typeof schema>

function SupplierFormDialog({
  open,
  onOpenChange,
  supplier,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier: Supplier | null
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
        name: supplier?.name ?? "",
        contact_email: supplier?.contact_email ?? "",
        phone: supplier?.phone ?? "",
        payment_terms: supplier?.payment_terms ?? "",
        is_active: supplier?.is_active ?? true,
      })
    }
  }, [open, supplier, reset])

  const onSubmit = async (values: FormValues) => {
    const payload: SupplierPayload = {
      name: values.name.trim(),
      contact_email: values.contact_email.trim(),
      phone: values.phone.trim(),
      payment_terms: values.payment_terms.trim(),
      ...(supplier ? { is_active: values.is_active } : {}),
    }
    try {
      if (supplier) {
        await dispatch(patchData({ id: supplier.id, payload: payload as Partial<Supplier> })).unwrap()
        toast.success("Supplier updated")
      } else {
        await dispatch(postData({ payload: payload as Partial<Supplier> })).unwrap()
        toast.success("Supplier added")
      }
      onOpenChange(false)
    } catch (err) {
      for (const [field, message] of Object.entries(getApiFieldErrors(err))) {
        if (field in schema.shape) setError(field as keyof FormValues, { message })
      }
      toast.error(getApiErrorMessage(err, "Failed to save supplier"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{supplier ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          <DialogDescription>Vendors you raise purchase orders against.</DialogDescription>
        </DialogHeader>
        <form id="supplier-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 py-2">
          <Field>
            <FieldLabel htmlFor="sup-name">Name *</FieldLabel>
            <FieldContent>
              <Input id="sup-name" aria-invalid={!!errors.name} {...register("name")} />
              <FieldError errors={[errors.name]} />
            </FieldContent>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="sup-email">Contact email</FieldLabel>
              <FieldContent>
                <Input id="sup-email" type="email" aria-invalid={!!errors.contact_email} {...register("contact_email")} />
                <FieldError errors={[errors.contact_email]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="sup-phone">Phone</FieldLabel>
              <FieldContent>
                <Input id="sup-phone" type="tel" {...register("phone")} />
                <FieldError errors={[errors.phone]} />
              </FieldContent>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="sup-terms">Payment terms</FieldLabel>
            <FieldContent>
              <Input id="sup-terms" placeholder="e.g. Net 30" {...register("payment_terms")} />
              <FieldError errors={[errors.payment_terms]} />
            </FieldContent>
          </Field>
          {supplier && (
            <Controller
              control={control}
              name="is_active"
              render={({ field }) => (
                <div className="flex items-center gap-3">
                  <Switch id="sup-active" checked={field.value} onCheckedChange={field.onChange} />
                  <Label htmlFor="sup-active">Active</Label>
                </div>
              )}
            />
          )}
        </form>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="supplier-form" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
            {supplier ? "Save Changes" : "Add Supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const IMPORT_FIELDS: ImportField[] = [
  { key: "name", label: "Name", required: true, aliases: ["Supplier", "Supplier name", "Vendor"], example: "Pran-RFL Distribution Ltd." },
  { key: "contact_email", label: "Contact email", aliases: ["Email"], example: "orders@pranrfl.com.bd" },
  { key: "phone", label: "Phone", aliases: ["Phone number", "Mobile"], example: "+8801712345678" },
  { key: "payment_terms", label: "Payment terms", aliases: ["Terms"], example: "Net 30" },
]

const Suppliers = () => {
  useDocumentTitle("Suppliers")
  const dispatch = useAppDispatch()
  const { data, isFetchingList, error, totalItems, meta } = useProcurementSelector((state) => state.suppliers)
  const canManage = useCanManagePurchasing()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search)
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)

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

  const handleDelete = async (supplier: Supplier) => {
    try {
      await dispatch(deleteData(supplier.id)).unwrap()
      toast.success("Supplier deleted")
      if (includeDeleted) load()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete supplier"))
    }
  }

  const handleRestore = async (supplier: Supplier) => {
    try {
      await dispatch(restoreSupplier(supplier.id)).unwrap()
      toast.success("Supplier restored")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to restore supplier"))
    }
  }

  const openForm = (supplier: Supplier | null) => {
    setEditing(supplier)
    setFormOpen(true)
  }

  const columns: ColumnDef<Supplier>[] = [
    {
      accessorKey: "name",
      header: "SUPPLIER",
      cell: ({ row }) => <span className="text-sm font-semibold text-foreground">{row.original.name}</span>,
    },
    {
      accessorKey: "contact_email",
      header: "EMAIL",
      cell: ({ row }) =>
        row.original.contact_email ? (
          <a
            href={`mailto:${row.original.contact_email}`}
            className="text-sm text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.original.contact_email}
          </a>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "phone",
      header: "PHONE",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.phone || "—"}</span>,
    },
    {
      accessorKey: "payment_terms",
      header: "TERMS",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.payment_terms || "—"}</span>,
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
        const supplier = row.original
        if (!canManage) return null
        if (supplier.deleted_at) {
          return (
            <div onClick={(e) => e.stopPropagation()} data-no-row-click="true">
              <Button variant="outline" size="sm" onClick={() => handleRestore(supplier)} aria-label={`Restore ${supplier.name}`}>
                <RotateCcw className="size-3.5" /> Restore
              </Button>
            </div>
          )
        }
        return (
          <TableActions itemName={supplier.name} onEdit={() => openForm(supplier)} onDelete={() => handleDelete(supplier)} />
        )
      },
    },
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Suppliers" description="Vendors you buy stock from." />
        {canManage && (
          <div className="flex flex-wrap items-center gap-3">
            <CsvImportButton
              entityName="suppliers"
              fields={IMPORT_FIELDS}
              createRow={(payload) => dispatch(postData({ payload: payload as Partial<Supplier> })).unwrap()}
              onComplete={() => {
                load()
              }}
            />
            <Button size="action" onClick={() => openForm(null)}>
              <Plus className="size-5" /> Add Supplier
            </Button>
          </div>
        )}
      </div>

      <FilterToolbar
        searchPlaceholder="Search name or email..."
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        filters={
          canManage
            ? [
                {
                  component: (
                    <DeletedToggle
                      pressed={includeDeleted}
                      onPressedChange={(v) => {
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
        onRowClick={canManage ? (s) => !s.deleted_at && openForm(s) : undefined}
        emptyIcon={Truck}
        emptyTitle="No suppliers yet"
        emptyActionLabel={canManage ? "Add Supplier" : undefined}
        onEmptyAction={canManage ? () => openForm(null) : undefined}
        minWidth="900px"
        columnWidths={["220px", "230px", "150px", "120px", "100px", "110px"]}
      />

      <SupplierFormDialog open={formOpen} onOpenChange={setFormOpen} supplier={editing} />
    </div>
  )
}

export default Suppliers
