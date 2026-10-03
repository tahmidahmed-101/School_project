import { useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { BadgeCheck, ImageIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { Combobox } from "@/components/common/ComboBox"
import { PageHeader } from "@/components/common/PageHeader"
import { TableActions } from "@/components/common/TableActions"
import { ActiveStatusBadge, ProductCell } from "@/components/common/cells"
import { FormDialog, SwitchField } from "@/components/common/FormDialog"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { FormField, TextField, TextareaField } from "@/components/common/form-fields"
import { ImagePicker } from "@/components/common/ImagePicker"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { useListPage } from "@/hooks/use-list-page"
import { getApiErrorMessage } from "@/lib/api/client"
import { reportFormError } from "@/lib/forms"
import { createImportLookup, splitList } from "@/lib/importLookup"
import type { Option } from "@/lib/types"

import { deleteData, fetchAll } from "../slices/brandSlice"
import { bulkBrandStatus, createBrand, fetchAllCategories, restoreBrand, updateBrand, uploadBrandImage } from "../api"
import type { Brand, BrandPayload } from "../types"
import { useCategoryOptions, type CategoryOption } from "../lib/useCategoryOptions"

const statusOptions: Option[] = [
  { label: "Active", value: "true" },
  { label: "Inactive", value: "false" },
]

const Brands = () => {
  useDocumentTitle("Brands")
  const dispatch = useAppDispatch()
  const canManage = useCan("catalog.manage")
  const brandState = useAppSelector((s) => s.brands)
  const brands = brandState.data
  const { options: categoryOptions, nameById } = useCategoryOptions()

  const [status, setStatus] = useState<Option | null>(null)
  const [category, setCategory] = useState<Option | null>(null)
  const [editing, setEditing] = useState<Brand | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const list = useListPage({
    fetch: (p) => dispatch(fetchAll(p)),
    state: brandState,
    params: { is_active: status?.value, category_id: category?.value },
  })

  // CSV import: "Categories" holds names/slugs separated by ";" (or "|"), resolved to ids.
  const categoryLookup = useMemo(
    () => createImportLookup("Category", () => fetchAllCategories(), (c) => [c.name, c.slug]),
    []
  )
  const importFields = useMemo<ImportField[]>(
    () => [
      { key: "name", label: "Name", required: true, aliases: ["brand", "brand name"], example: "Aarong" },
      { key: "description", label: "Description", example: "Bangladeshi lifestyle brand known for handcrafted clothing." },
      {
        key: "category_ids",
        label: "Categories",
        aliases: ["category", "category names"],
        example: "Panjabi & Kurta; Home & Lifestyle",
        resolve: (raw: string) => Promise.all(splitList(raw).map(categoryLookup.resolve)),
      },
    ],
    [categoryLookup]
  )

  const handleRestore = async (brand: Brand) => {
    try {
      await restoreBrand(brand.id)
      toast.success(`${brand.name} restored`)
      list.reload()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to restore brand"))
    }
  }

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
          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
            {row.original.image ? (
              <img src={row.original.image} alt="" className="size-full object-cover" />
            ) : (
              <ImageIcon className="size-4 text-muted-foreground" />
            )}
          </div>
          <ProductCell name={row.original.name} sub={row.original.slug} />
        </div>
      ),
    },
    {
      id: "categories",
      header: "CATEGORIES",
      cell: ({ row }) => (
        <span className="line-clamp-2 text-sm text-muted-foreground">
          {row.original.category_ids.map((cid) => nameById.get(cid) ?? "—").join(", ") || "—"}
        </span>
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
            deleted={Boolean(brand.deleted_at)}
            onRestore={() => handleRestore(brand)}
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
        title="Brands"
        actions={
          canManage && (
            <>
              <CsvImportButton
                entityName="brands"
                fields={importFields}
                createRow={(payload) => createBrand(payload as BrandPayload)}
                onComplete={() => {
                  categoryLookup.reset()
                  list.reload()
                }}
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
                placeholder="Category"
                options={categoryOptions.map((o) => ({ label: o.label, value: o.value }))}
                value={category}
                onValueChange={setCategory}
              />
            ),
          },
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
        emptyDescription="Add a brand and link it to the categories it sells in."
        minWidth="760px"
        columnWidths={["280px", "260px", "110px", "80px"]}
        unlabelledColumns={["actions"]}
      />

      {canManage && (
        <BrandFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          brand={editing}
          categoryOptions={categoryOptions}
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
  category_ids: z.array(z.string()),
})
type BrandValues = z.infer<typeof brandSchema>

function BrandFormDialog({
  open,
  onOpenChange,
  brand,
  categoryOptions,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  brand: Brand | null
  categoryOptions: CategoryOption[]
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
    defaultValues: { name: "", description: "", is_active: true, category_ids: [] },
  })

  useEffect(() => {
    if (!open) return
    reset({
      name: brand?.name ?? "",
      description: brand?.description ?? "",
      is_active: brand?.is_active ?? true,
      category_ids: brand?.category_ids ?? [],
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
      category_ids: values.category_ids,
    }
    try {
      let saved: Brand
      if (brand) {
        payload.is_active = values.is_active
        saved = await updateBrand(brand.id, payload)
      } else {
        saved = await createBrand(payload)
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
      description="Link the brand to the categories it appears in."
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
      <Field>
        <FieldLabel>Categories</FieldLabel>
        <FieldContent>
          <Controller
            control={control}
            name="category_ids"
            render={({ field }) => (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                {categoryOptions.length === 0 && <p className="p-1 text-sm text-muted-foreground">No categories.</p>}
                {categoryOptions.map((o) => {
                  const checked = field.value.includes(o.value)
                  return (
                    <label
                      key={o.value}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent"
                      style={{ paddingLeft: 4 + o.depth * 16 }}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          field.onChange(v ? [...field.value, o.value] : field.value.filter((x) => x !== o.value))
                        }
                      />
                      {o.label}
                    </label>
                  )
                })}
              </div>
            )}
          />
          <FieldError errors={[errors.category_ids]} />
        </FieldContent>
      </Field>
      <FormField label="Logo / image" htmlFor="brand-image" description="Uploaded when you save.">
        <ImagePicker id="brand-image" src={brand?.image} onSelect={setImageFile} />
      </FormField>
      {brand && <SwitchField control={control} name="is_active" label="Active" />}
    </FormDialog>
  )
}

export default Brands
