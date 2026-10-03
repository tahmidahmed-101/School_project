import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { CornerDownRight, FolderTree, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { Combobox } from "@/components/common/ComboBox"
import { PageHeader } from "@/components/common/PageHeader"
import { StatusBadge } from "@/components/common/StatusBadge"
import { TableActions } from "@/components/common/TableActions"
import { ActiveStatusBadge } from "@/components/common/cells"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { RestoreDeletedButton } from "@/components/common/RestoreDeletedButton"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { getApiErrorMessage } from "@/lib/api/client"
import { createImportLookup } from "@/lib/importLookup"
import type { Option } from "@/lib/types"

import { createCategory, deleteCategory, fetchAllCategories, restoreCategory, updateCategory } from "../api"
import { categoryTypeOptions, type Category, type CategoryPayload } from "../types"
import { useCategoryOptions, type CategoryOption } from "../lib/useCategoryOptions"

const Categories = () => {
  useDocumentTitle("Categories")
  const navigate = useNavigate()
  const canManage = useCan("catalog.manage")
  const { options, isLoading, error, reload } = useCategoryOptions()
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
              <img loading="lazy" decoding="async"
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
      cell: ({ row }) => (
        <ActiveStatusBadge deleted={row.original.category.deleted_at} active={row.original.category.is_active} />
      ),
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => {
        const o = row.original
        if (!canManage) return null
        return (
          <TableActions
            itemName={o.label}
            editUrl={`/category_form/${o.value}`}
            onDelete={() => handleDelete(o)}
          />
        )
      },
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Categories"
        actions={
          canManage && (
            <>
              <RestoreDeletedButton<Category>
                noun="categories"
                endpoint="/admin/catalog/categories/"
                restore={(item) => restoreCategory(item.id)}
                label={(item) => item.name}
                onRestored={reload}
              />
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
            </>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search categories…"
        searchValue={search}
        onSearchChange={setSearch}
        filters={[
          {
            component: (
              <Combobox
                placeholder="Category type"
                options={categoryTypeOptions}
                value={type}
                onValueChange={setType}
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
                noun: "category",
                getId: (o) => o.value,
                isSelectable: (o) => !o.category.deleted_at,
                deleteRow: (o) => deleteCategory(o.value),
        activate: (rows) => Promise.all(rows.map((o) => updateCategory(o.value, { is_active: true }))),
        deactivate: (rows) => Promise.all(rows.map((o) => updateCategory(o.value, { is_active: false }))),
                onDone: reload,
              }
            : undefined
        }
        data={rows}
        isLoading={isLoading}
        error={error}
        onRetry={reload}
        pageSize={50}
        emptyIcon={FolderTree}
        emptyTitle="No categories"
        emptyDescription="Create a root category, then nest subcategories under it."
        minWidth="760px"
        columnWidths={["320px", "200px", "110px", "110px", "80px"]}
        unlabelledColumns={["actions"]}
      />
    </div>
  )
}

export default Categories
