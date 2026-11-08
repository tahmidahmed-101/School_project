import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { ColumnDef } from "@tanstack/react-table"
import { Plus, Truck } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { FormDialog, SwitchField } from "@/components/common/FormDialog"
import { TextCell } from "@/components/common/cells"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { TextField } from "@/components/common/form-fields"
import { RestoreDeletedButton } from "@/components/common/RestoreDeletedButton"
import { reportFormError } from "@/lib/forms"
import { useAppDispatch } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useSoftDeleteList } from "@/hooks/use-soft-delete-list"

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
      ...(supplier ? { is_active: values.is_active } : { kind: "stock" }),
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
      <TextField label="Name *" id="sup-name" error={errors.name} {...register("name")} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField
          label="Contact email"
          id="sup-email"
          type="email"
          error={errors.contact_email}
          {...register("contact_email")}
        />
        <TextField label="Phone" id="sup-phone" type="tel" error={errors.phone} {...register("phone")} />
      </div>
      <TextField
        label="Payment terms"
        id="sup-terms"
        placeholder="e.g. Net 30"
        error={errors.payment_terms}
        {...register("payment_terms")}
      />
      {supplier && <SwitchField control={control} name="is_active" label="Status" onLabel="Active" offLabel="Inactive" />}
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

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)

  const openForm = (supplier: Supplier | null) => {
    setEditing(supplier)
    setFormOpen(true)
  }

  const { list, statusColumn, actionsColumn, bulk } = useSoftDeleteList<Supplier>({
    fetch: (p) => dispatch(fetchAll(p)),
    state,
    params: { kind: "stock" },
    noun: "supplier",
    canUpdate: canManage,
    remove: (id) => dispatch(deleteData(id)).unwrap(),
    setActive: (id, is_active) => dispatch(patchData({ id, payload: { is_active } as Partial<Supplier> })).unwrap(),
    onEdit: openForm,
    onDeleted: () => toast.success("Supplier deleted"),
  })


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
    statusColumn,
    actionsColumn,
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Suppliers"
        actions={
          canManage && (
            <>
              <RestoreDeletedButton<Supplier>
                noun="suppliers"
                endpoint="/admin/procurement/suppliers/"
                params={{ kind: "stock" }}
                restore={(item) => dispatch(restoreSupplier(item.id)).unwrap()}
                label={(item) => item.name}
                onRestored={list.reload}
              />
              <CsvImportButton
                entityName="suppliers"
                fields={IMPORT_FIELDS}
                createRow={(payload) =>
                  dispatch(postData({ payload: { ...(payload as SupplierPayload), kind: "stock" } as Partial<Supplier> })).unwrap()
                }
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
      />

      <DataTable
        columns={columns}
        bulk={bulk}
        data={state.data}
        {...list.tableProps}
        onRowClick={canManage ? (s) => !s.deleted_at && openForm(s) : undefined}
        emptyIcon={Truck}
        emptyTitle="No suppliers yet"
        emptyActionLabel={canManage ? "Add Supplier" : undefined}
        onEmptyAction={canManage ? () => openForm(null) : undefined}
        minWidth="900px"
        columnWidths={["220px", "230px", "150px", "120px", "100px", "80px"]}
      />

      <SupplierFormDialog open={formOpen} onOpenChange={setFormOpen} supplier={editing} />
    </div>
  )
}

export default Suppliers
