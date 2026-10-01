import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { CornerDownRight, FolderTree, PlusIcon, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { PageHeading } from "@/components/common/PageHeading"
import { StatusBadge } from "@/components/common/StatusBadge"
import { TableActions } from "@/components/common/TableActions"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"

import { createCategory, deleteCategory, fetchAllCategories, restoreCategory } from "../api"
import { categoryTypeOptions, type Category, type CategoryPayload } from "../types"
import { useCategoryOptions, type CategoryOption } from "../lib/useCategoryOptions"
import { usePermission } from "../lib/usePermission"
import { DeletedToggle } from "@/components/common/DeletedToggle"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { createImportLookup } from "../lib/importLookup"

type Option = { label: string; value: string }

const Categories = () => {
  useDocumentTitle("Categories")
  const navigate = useNavigate()
  const canManage = usePermission("catalog.manage")
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const { options, isLoading, error, reload } = useCategoryOptions(includeDeleted)
  const [search, setSearch] = useState("")
  const [type, setType] = useState<Option | null>(null)

  // CSV import. Parents are looked up by name/slug; categories created earlier in the same
  // file are added to the lookup, so a parent row can precede its children.
  const parentLookup = useMemo(
    () => createImportLookup<Category>("Parent category", () => fetchAllCategories(), (c) => [c.name, c.slug]),
    []
  )
  const importFields = useMemo<ImportField[]>(
    () => [
      { key: "name", label: "Name", required: true, aliases: ["category", "category name"], example: "Eid Panjabi" },
      {
        key: "parent_id",
        label: "Parent category",
        aliases: ["parent", "parent name", "parent slug", "parent id"],
        example: "Panjabi & Kurta",
        resolve: parentLookup.resolve,
      },
      {
        key: "category_type",
        label: "Category type",
        type: "enum",
        options: ["stock", "preorder"],
        aliases: ["type"],
        example: "stock",
        // Root categories only; a subcategory always takes its parent's type.
      },
      { key: "description", label: "Description", example: "Festive embroidered panjabis for Eid." },
    ],
    [parentLookup]
  )
  const importCategory = async (payload: Record<string, unknown>) => {
    // A subcategory inherits its parent's type (the backend rejects a mismatching one).
    const created = await createCategory(payload as CategoryPayload)
    parentLookup.add(created)
    return created
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return options.filter(
      (o) =>
        (!type || o.category.category_type === type.value) &&
        (!q || o.category.name.toLowerCase().includes(q) || o.category.slug.toLowerCase().includes(q))
    )
  }, [options, search, type])
  const flat = Boolean(search.trim())

  const handleDelete = async (o: CategoryOption) => {
    try {
      await deleteCategory(o.value)
      toast.success(`${o.label} deleted`)
      reload()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete category"))
    }
  }

  const handleRestore = async (o: CategoryOption) => {
    try {
      await restoreCategory(o.value)
      toast.success(`${o.label} restored`)
      reload()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to restore category"))
    }
  }

  const columns: ColumnDef<CategoryOption>[] = [
    {
      id: "name",
      header: "CATEGORY",
      cell: ({ row }) => {
        const depth = flat ? 0 : row.original.depth
        return (
          <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depth * 20 }}>
            {depth > 0 && <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" />}
            {row.original.category.image ? (
              <img
                src={row.original.category.image}
                alt=""
                className="size-8 shrink-0 rounded-md border border-border object-cover"
              />
            ) : null}
            <span className="truncate text-sm font-medium">{row.original.label}</span>
          </div>
        )
      },
    },
    {
      id: "slug",
      header: "SLUG",
      cell: ({ row }) => <span className="truncate text-sm text-muted-foreground">{row.original.category.slug}</span>,
    },
    {
      id: "type",
      header: "TYPE",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.category.category_type}
          tone={row.original.category.category_type === "preorder" ? "info" : "secondary"}
          label={row.original.category.category_type === "preorder" ? "Pre-order" : "Stock"}
        />
      ),
    },
    {
      id: "status",
      header: "STATUS",
      cell: ({ row }) =>
        row.original.category.deleted_at ? (
          <StatusBadge status="deleted" tone="destructive" />
        ) : (
          <StatusBadge status={row.original.category.is_active ? "active" : "inactive"} />
        ),
    },
    {
      id: "actions",
      header: "ACTION",
      cell: ({ row }) => {
        const o = row.original
        if (!canManage) return null
        if (o.category.deleted_at) {
          return (
            <Button variant="outline" size="sm" onClick={() => void handleRestore(o)}>
              <RotateCcw /> Restore
            </Button>
          )
        }
        return (
          <TableActions
            itemName={o.label}
            editUrl={`/category_form/${o.value}`}
            onDelete={() => void handleDelete(o)}
          />
        )
      },
    },
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Categories" description="Organise products into a category tree" />
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <CsvImportButton
              entityName="categories"
              fields={importFields}
              createRow={importCategory}
              onComplete={() => {
                parentLookup.reset()
                reload()
              }}
            />
            <Button size="action" onClick={() => navigate("/category_form/new")}>
              <PlusIcon className="size-5" /> Add Category
            </Button>
          </div>
        )}
      </div>

      <FilterToolbar
        searchPlaceholder="Search categories…"
        searchValue={search}
        onSearchChange={setSearch}
        filters={[
          {
            component: (
              <ExampleComboboxCustomItems
                placeholder="Category type"
                frameworks={categoryTypeOptions}
                value={type}
                onValueChange={setType}
              />
            ),
          },
          ...(canManage
            ? [
                {
                  component: (
                    <DeletedToggle pressed={includeDeleted} onPressedChange={setIncludeDeleted} />
                  ),
                },
              ]
            : []),
        ]}
      />

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        error={error}
        onRetry={reload}
        pageSize={50}
        emptyIcon={FolderTree}
        emptyTitle="No categories"
        emptyDescription="Create a root category, then nest subcategories under it."
        minWidth="760px"
        columnWidths={["320px", "200px", "110px", "110px", "120px"]}
        unlabelledColumns={["actions"]}
      />
    </div>
  )
}

export default Categories
