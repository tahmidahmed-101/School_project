import { useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { BadgeCheck, ImageIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { Combobox } from "@/components/common/ComboBox"
import { PageHeader } from "@/components/common/PageHeader"
import { TableActions } from "@/components/common/TableActions"
import { ActiveStatusBadge, ProductCell, Thumbnail } from "@/components/common/cells"
import { FormDialog, SwitchField } from "@/components/common/FormDialog"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { FormField, TextField, TextareaField } from "@/components/common/form-fields"
import { ImagePicker } from "@/components/common/ImagePicker"
import { RestoreDeletedButton } from "@/components/common/RestoreDeletedButton"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useKind, type Kind } from "@/hooks/use-kind"
import { useCan } from "@/hooks/use-can"
import { useListPage } from "@/hooks/use-list-page"
import { getApiErrorMessage } from "@/lib/api/client"
import { reportFormError } from "@/lib/forms"
import type { Option } from "@/lib/types"

import { deleteData, fetchAll } from "../slices/brandSlice"
import { bulkBrandStatus, createBrand, restoreBrand, updateBrand, uploadBrandImage } from "../api"
import type { Brand, BrandPayload } from "../types"

const statusOptions: Option[] = [
  { label: "Active", value: "true" },
  { label: "Inactive", value: "false" },
]

const BrandsList = () => {
  const kind = useKind()
  const title = kind === "preorder" ? "Pre-order brands" : "Brands"
  useDocumentTitle(title)
  const dispatch = useAppDispatch()
  const canManage = useCan("catalog.manage")
  const brandState = useAppSelector((s) => s.brands)
  const brands = useMemo(() => brandState.data.filter((b) => b.kind === kind), [brandState.data, kind])

  const [status, setStatus] = useState<Option | null>(null)
  const [editing, setEditing] = useState<Brand | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const list = useListPage({
    fetch: (p) => dispatch(fetchAll(p)),
    state: brandState,
    params: { is_active: status?.value, kind },
  })

  const importFields = useMemo<ImportField[]>(
    () => [
      { key: "name", label: "Name", required: true, aliases: ["brand", "brand name"], example: "Aarong" },
      { key: "description", label: "Description", example: "Bangladeshi lifestyle brand known for handcrafted clothing." },
    ],
    []
  )


  const handleDelete = async (brand: Brand) => {
    try {
      await dispatch(deleteData(brand.id)).unwrap()
      toast.success(`${brand.name} deleted`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete brand"))
    }
  }

  const columns: ColumnDef<Brand>[] = [
    {
      accessorKey: "name",
      header: "BRAND",
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <Thumbnail src={row.original.image} icon={ImageIcon} />
          <ProductCell name={row.original.name} sub={row.original.slug} />
        </div>
      ),
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
        const brand = row.original
        if (!canManage) return null
        return (
          <TableActions
            itemName={brand.name}
            onEdit={() => {
              setEditing(brand)
              setFormOpen(true)
            }}
            onDelete={() => handleDelete(brand)}
          />
        )
      },
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title={title}
        actions={
          canManage && (
            <>
              <RestoreDeletedButton<Brand>
                noun="brands"
                endpoint="/admin/catalog/brands/"
                params={{ kind }}
                restore={(item) => restoreBrand(item.id)}
                label={(item) => item.name}
                onRestored={list.reload}
              />
              <CsvImportButton
                entityName="brands"
                fields={importFields}
                createRow={(payload) => createBrand({ ...(payload as BrandPayload), kind })}
                onComplete={list.reload}
              />
              <Button
                size="action"
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <PlusIcon className="size-5" /> Add Brand
              </Button>
            </>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search brands…"
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[
          {
            component: (
              <Combobox
                placeholder="Status"
                options={statusOptions}
                value={status}
                onValueChange={setStatus}
              />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        bulk={
          canManage
            ? {
                noun: "brand",
                deleteRow: (b) => dispatch(deleteData(b.id)).unwrap(),
                activate: (rows) => bulkBrandStatus(rows.map((r) => r.id), true),
                deactivate: (rows) => bulkBrandStatus(rows.map((r) => r.id), false),
                onDone: list.reload,
              }
            : undefined
        }
        data={brands}
        {...list.tableProps}
        emptyIcon={BadgeCheck}
        emptyTitle="No brands"
        emptyDescription={
          kind === "preorder" ? "Add a brand for your pre-order products." : "Add a brand for your products."
        }
        minWidth="760px"
        columnWidths={["auto", "130px", "80px"]}
        unlabelledColumns={["actions"]}
      />

      {canManage && (
        <BrandFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          brand={editing}
          kind={kind}
          onSaved={list.reload}
        />
      )}
    </div>
  )
}

const brandSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string(),
  is_active: z.boolean(),
})
type BrandValues = z.infer<typeof brandSchema>

function BrandFormDialog({
  open,
  onOpenChange,
  brand,
  kind,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  brand: Brand | null
  /** The half of the dashboard the page belongs to; a new brand is created in it. */
  kind: Kind
  onSaved: () => void
}) {
  const [imageFile, setImageFile] = useState<File | null>(null)
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BrandValues>({
    resolver: zodResolver(brandSchema),
    defaultValues: { name: "", description: "", is_active: true },
  })

  useEffect(() => {
    if (!open) return
    reset({
      name: brand?.name ?? "",
      description: brand?.description ?? "",
      is_active: brand?.is_active ?? true,
    })
  }, [open, brand, reset])

  const close = (o: boolean) => {
    if (!o) setImageFile(null)
    onOpenChange(o)
  }

  const onSubmit = async (values: BrandValues) => {
    const payload: BrandPayload = {
      name: values.name,
      description: values.description,
    }
    try {
      let saved: Brand
      if (brand) {
        payload.is_active = values.is_active
        saved = await updateBrand(brand.id, payload)
      } else {
        saved = await createBrand({ ...payload, kind })
      }
      if (imageFile) {
        try {
          await uploadBrandImage(saved.id, imageFile)
        } catch (err) {
          toast.error(getApiErrorMessage(err, "Brand saved, but the image upload failed"))
        }
      }
      toast.success(`${values.name} ${brand ? "updated" : "created"}`)
      setImageFile(null)
      onSaved()
      onOpenChange(false)
    } catch (err) {
      reportFormError(err, { setError, fields: Object.keys(values), fallback: "Failed to save brand" })
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title={brand ? `Edit ${brand.name}` : "Add brand"}
      description={
        kind === "preorder" ? "Shown on pre-order products only." : "Shown on stock products only."
      }
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={brand ? "Save brand" : "Create brand"}
    >
      <TextField label="Name" id="brand-name" error={errors.name} {...register("name")} />
      <TextareaField
        label="Description"
        id="brand-description"
        rows={3}
        error={errors.description}
        {...register("description")}
      />
      <FormField label="Logo / image" htmlFor="brand-image" description="Uploaded when you save.">
        <ImagePicker id="brand-image" src={brand?.image} onSelect={setImageFile} />
      </FormField>
      {brand && <SwitchField control={control} name="is_active" label="Active" />}
    </FormDialog>
  )
}

const Brands = () => <BrandsList key={useKind()} />

export default Brands
