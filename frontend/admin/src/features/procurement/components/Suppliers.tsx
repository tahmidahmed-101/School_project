import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { ColumnDef } from "@tanstack/react-table"
import { Plus, Truck } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { TableActions } from "@/components/common/TableActions"
import { PageHeader } from "@/components/common/PageHeader"
import { FormDialog, SwitchField } from "@/components/common/FormDialog"
import { ActiveStatusBadge, TextCell } from "@/components/common/cells"
import { DeletedToggle } from "@/components/common/DeletedToggle"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { getApiErrorMessage } from "@/lib/api/client"
import { reportFormError } from "@/lib/forms"
import { useAppDispatch } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"

import { deleteData, fetchAll, patchData, postData, restoreSupplier } from "../slices/supplierSlice"
import type { Supplier, SupplierPayload } from "../types"
import { useCanManagePurchasing, useProcurementSelector } from "../hooks/useProcurement"

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
      reportFormError(err, { setError, fields: Object.keys(schema.shape), fallback: "Failed to save supplier" })
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={supplier ? "Edit Supplier" : "Add Supplier"}
      description="Vendors you raise purchase orders against."
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={supplier ? "Save Changes" : "Add Supplier"}
    >
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
      {supplier && <SwitchField control={control} name="is_active" label="Active" />}
    </FormDialog>
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
  const state = useProcurementSelector((state) => state.suppliers)
  const canManage = useCanManagePurchasing()

  const list = useListPage({ fetch: (p) => dispatch(fetchAll(p)), state })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)

  const handleDelete = async (supplier: Supplier) => {
    try {
      await dispatch(deleteData(supplier.id)).unwrap()
      toast.success("Supplier deleted")
      if (list.includeDeleted) list.reload()
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
          <TextCell value={null} />
        ),
    },
    {
      accessorKey: "phone",
      header: "PHONE",
      cell: ({ row }) => <TextCell value={row.original.phone} muted />,
    },
    {
      accessorKey: "payment_terms",
      header: "TERMS",
      cell: ({ row }) => <TextCell value={row.original.payment_terms} muted />,
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
        const supplier = row.original
        if (!canManage) return null
        return (
          <TableActions
            itemName={supplier.name}
            deleted={!!supplier.deleted_at}
            onRestore={() => handleRestore(supplier)}
            onEdit={() => openForm(supplier)}
            onDelete={() => handleDelete(supplier)}
          />
        )
      },
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Suppliers"
        description="Vendors you buy stock from."
        actions={
          canManage && (
            <>
              <CsvImportButton
                entityName="suppliers"
                fields={IMPORT_FIELDS}
                createRow={(payload) => dispatch(postData({ payload: payload as Partial<Supplier> })).unwrap()}
                onComplete={list.reload}
              />
              <Button size="action" onClick={() => openForm(null)}>
                <Plus className="size-5" /> Add Supplier
              </Button>
            </>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search name or email..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={
          canManage
            ? [{ component: <DeletedToggle pressed={list.includeDeleted} onPressedChange={list.setIncludeDeleted} /> }]
            : []
        }
      />

      <DataTable
        columns={columns}
        data={state.data}
        {...list.tableProps}
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
