import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { BadgeCheck, ImageIcon, Loader2, PlusIcon, RotateCcw, ToggleLeft, ToggleRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { PageHeading } from "@/components/common/PageHeading"
import { StatusBadge } from "@/components/common/StatusBadge"
import { TableActions } from "@/components/common/TableActions"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"

import { deleteData, fetchAll } from "../slices/brandSlice"
import { bulkBrandStatus, createBrand, fetchAllCategories, restoreBrand, updateBrand, uploadBrandImage } from "../api"
import type { Brand, BrandPayload } from "../types"
import { usePermission } from "../lib/usePermission"
import { useDebounced } from "../lib/useDebounced"
import { useCategoryOptions, type CategoryOption } from "../lib/useCategoryOptions"
import { DeletedToggle } from "@/components/common/DeletedToggle"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { createImportLookup, splitList } from "../lib/importLookup"

type Option = { label: string; value: string }
const PAGE_SIZE = 20

const Brands = () => {
  useDocumentTitle("Brands")
  const dispatch = useAppDispatch()
  const canManage = usePermission("catalog.manage")
  const { data: brands, isFetchingList, error, totalItems } = useAppSelector((s) => s.brands)
  const { options: categoryOptions, nameById } = useCategoryOptions()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounced(search)
  const [status, setStatus] = useState<Option | null>(null)
  const [category, setCategory] = useState<Option | null>(null)
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [editing, setEditing] = useState<Brand | null>(null)
  const [formOpen, setFormOpen] = useState(false)

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

  const params = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      ...(status ? { is_active: status.value } : {}),
      ...(category ? { category_id: category.value } : {}),
      ...(includeDeleted ? { include_deleted: true } : {}),
    }),
    [page, debouncedSearch, status, category, includeDeleted]
  )
  const load = useCallback(() => {
    dispatch(fetchAll(params))
  }, [dispatch, params])
  useEffect(() => {
    load()
  }, [load])

  const resetPaging = () => {
    setPage(1)
    setSelected([])
  }

  const selectable = brands.filter((b) => !b.deleted_at)
  const allSelected = selectable.length > 0 && selectable.every((b) => selected.includes(b.id))

  const runBulk = async (isActive: boolean) => {
    try {
      const res = await bulkBrandStatus(selected, isActive)
      toast.success(`${res.affected} brand(s) ${isActive ? "activated" : "deactivated"}`)
      setSelected([])
      load()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Bulk update failed"))
    }
  }

  const columns: ColumnDef<Brand>[] = [
    ...(canManage
      ? [
          {
            id: "select",
            header: () => (
              <Checkbox
                aria-label="Select all on this page"
                checked={allSelected}
                onCheckedChange={(v) => setSelected(v ? selectable.map((b) => b.id) : [])}
              />
            ),
            cell: ({ row }: { row: { original: Brand } }) =>
              row.original.deleted_at ? null : (
                <Checkbox
                  aria-label={`Select ${row.original.name}`}
                  checked={selected.includes(row.original.id)}
                  onCheckedChange={(v) =>
                    setSelected((prev) =>
                      v ? [...prev, row.original.id] : prev.filter((x) => x !== row.original.id)
                    )
                  }
                />
              ),
          } as ColumnDef<Brand>,
        ]
      : []),
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
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{row.original.name}</div>
            <div className="truncate text-xs text-muted-foreground">{row.original.slug}</div>
          </div>
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
      cell: ({ row }) =>
        row.original.deleted_at ? (
          <StatusBadge status="deleted" tone="destructive" />
        ) : (
          <StatusBadge status={row.original.is_active ? "active" : "inactive"} />
        ),
    },
    {
      id: "actions",
      header: "ACTION",
      cell: ({ row }) => {
        const brand = row.original
        if (!canManage) return null
        if (brand.deleted_at) {
          return (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await restoreBrand(brand.id)
                  toast.success(`${brand.name} restored`)
                  load()
                } catch (err) {
                  toast.error(getApiErrorMessage(err, "Failed to restore brand"))
                }
              }}
            >
              <RotateCcw /> Restore
            </Button>
          )
        }
        return (
          <TableActions
            itemName={brand.name}
            onEdit={() => {
              setEditing(brand)
              setFormOpen(true)
            }}
            onDelete={async () => {
              try {
                await dispatch(deleteData(brand.id)).unwrap()
                toast.success(`${brand.name} deleted`)
              } catch (err) {
                toast.error(getApiErrorMessage(err, "Failed to delete brand"))
              }
            }}
          />
        )
      },
    },
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Brands" description="Brands shown on the storefront, linked to categories" />
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <CsvImportButton
              entityName="brands"
              fields={importFields}
              createRow={(payload) => createBrand(payload as BrandPayload)}
              onComplete={() => {
                categoryLookup.reset()
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
              <PlusIcon className="size-5" /> Add Brand
            </Button>
          </div>
        )}
      </div>

      <FilterToolbar
        searchPlaceholder="Search brands…"
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v)
          resetPaging()
        }}
        filters={[
          {
            component: (
              <ExampleComboboxCustomItems
                placeholder="Category"
                frameworks={categoryOptions.map((o) => ({ label: o.label, value: o.value }))}
                value={category}
                onValueChange={(v) => {
                  setCategory(v)
                  resetPaging()
                }}
              />
            ),
          },
          {
            component: (
              <ExampleComboboxCustomItems
                placeholder="Status"
                frameworks={[
                  { label: "Active", value: "true" },
                  { label: "Inactive", value: "false" },
                ]}
                value={status}
                onValueChange={(v) => {
                  setStatus(v)
                  resetPaging()
                }}
              />
            ),
          },
          ...(canManage
            ? [
                {
                  component: (
                    <DeletedToggle pressed={includeDeleted} onPressedChange={(v) => {
                          setIncludeDeleted(v)
                          resetPaging()
                        }} />
                  ),
                },
              ]
            : []),
        ]}
      />

      {canManage && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm">
          <span className="font-medium">{selected.length} selected</span>
          <Button size="sm" variant="outline" onClick={() => runBulk(true)}>
            <ToggleRight /> Activate
          </Button>
          <Button size="sm" variant="outline" onClick={() => runBulk(false)}>
            <ToggleLeft /> Deactivate
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={brands}
        isLoading={isFetchingList}
        error={error}
        onRetry={load}
        manualPagination
        pageSize={PAGE_SIZE}
        pageIndex={page - 1}
        pageCount={Math.max(1, Math.ceil(totalItems / PAGE_SIZE))}
        totalCount={totalItems}
        onPageChange={(i) => {
          setPage(i + 1)
          setSelected([])
        }}
        emptyIcon={BadgeCheck}
        emptyTitle="No brands"
        emptyDescription="Add a brand and link it to the categories it sells in."
        minWidth="760px"
        columnWidths={[...(canManage ? ["48px"] : []), "280px", "260px", "110px", "120px"]}
        unlabelledColumns={["select", "actions"]}
      />

      {canManage && (
        <BrandFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          brand={editing}
          categoryOptions={categoryOptions}
          onSaved={load}
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
      for (const [field, message] of Object.entries(getApiFieldErrors(err))) {
        if (field in values) setError(field as keyof BrandValues, { message })
      }
      toast.error(getApiErrorMessage(err, "Failed to save brand"))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setImageFile(null)
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{brand ? `Edit ${brand.name}` : "Add brand"}</DialogTitle>
          <DialogDescription>Link the brand to the categories it appears in.</DialogDescription>
        </DialogHeader>
        <form id="brand-form" onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="brand-name">Name</FieldLabel>
            <FieldContent>
              <Input id="brand-name" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="brand-description">Description</FieldLabel>
            <FieldContent>
              <Textarea id="brand-description" rows={3} {...register("description")} />
              <FieldError errors={[errors.description]} />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>Categories</FieldLabel>
            <FieldContent>
              <Controller
                control={control}
                name="category_ids"
                render={({ field }) => (
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                    {categoryOptions.length === 0 && (
                      <p className="p-1 text-sm text-muted-foreground">No categories.</p>
                    )}
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
          <Field>
            <FieldLabel htmlFor="brand-image">Logo / image</FieldLabel>
            <FieldContent>
              <Input
                id="brand-image"
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              />
              <FieldDescription>Uploaded when you save.</FieldDescription>
            </FieldContent>
          </Field>
          {brand && (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="brand-active">Active</FieldLabel>
              </FieldContent>
              <Controller
                control={control}
                name="is_active"
                render={({ field }) => <Switch id="brand-active" checked={field.value} onCheckedChange={field.onChange} />}
              />
            </Field>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="brand-form" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {brand ? "Save brand" : "Create brand"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default Brands
