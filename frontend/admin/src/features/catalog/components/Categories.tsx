import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { FolderTree, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { TableActions } from "@/components/common/TableActions"
import { ActiveStatusBadge } from "@/components/common/cells"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { RestoreDeletedButton } from "@/components/common/RestoreDeletedButton"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { useKind, type Kind, withKind } from "@/hooks/use-kind"
import { getApiErrorMessage } from "@/lib/api/client"
import { createImportLookup } from "@/lib/importLookup"

import { createCategory, deleteCategory, fetchAllCategories, restoreCategory, updateCategory } from "../api"
import type { Category, CategoryPayload } from "../types"
import { useCategoryOptions, type CategoryOption } from "../lib/useCategoryOptions"

const Categories = ({ kind }: { kind: Kind }) => {
  const title = kind === "preorder" ? "Pre-order categories" : "Categories"
  useDocumentTitle(title)
  const navigate = useNavigate()
  const canManage = useCan("catalog.manage")
  const { options, nameById, isLoading, error, reload } = useCategoryOptions(kind)
  const [search, setSearch] = useState("")

  // CSV import (stock page only). Parents are looked up by name/slug; categories created earlier
  // in the same file are added to the lookup, so a parent row can precede its children.
  const parentLookup = useMemo(
    () => createImportLookup<Category>("Parent category", () => fetchAllCategories("stock"), (c) => [c.name, c.slug]),
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
      { key: "description", label: "Description", example: "Festive embroidered panjabis for Eid." },
    ],
    [parentLookup]
  )
  const importCategory = async (payload: Record<string, unknown>) => {
    const row = payload as CategoryPayload
    // A subcategory takes its parent's kind on the server; only a root category is told it.
    const created = await createCategory(row.parent_id ? row : { ...row, category_type: "stock" })
    parentLookup.add(created)
    return created
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return options.filter(
      (o) => !q || o.category.name.toLowerCase().includes(q) || o.category.slug.toLowerCase().includes(q)
    )
  }, [options, search])

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
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          {row.original.category.image ? (
            <img loading="lazy" decoding="async"
              src={row.original.category.image}
              alt=""
              className="size-8 shrink-0 rounded-md border border-border object-cover"
            />
          ) : null}
          <span className="truncate text-sm font-medium">{row.original.label}</span>
        </div>
      ),
    },
    {
      id: "parent",
      header: "ROOT CATEGORY",
      cell: ({ row }) => {
        const parentId = row.original.category.parent_id
        return (
          <span className="truncate text-sm text-muted-foreground">{(parentId && nameById.get(parentId)) || "—"}</span>
        )
      },
    },
    {
      id: "slug",
      header: "SLUG",
      cell: ({ row }) => <span className="truncate text-sm text-muted-foreground">{row.original.category.slug}</span>,
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
            editUrl={withKind(`/category_form/${o.value}`, kind)}
            onDelete={() => handleDelete(o)}
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
              <RestoreDeletedButton<Category>
                noun="categories"
                endpoint="/admin/catalog/categories/"
                params={{ category_type: kind }}
                restore={(item) => restoreCategory(item.id)}
                label={(item) => item.name}
                onRestored={reload}
              />
              {kind === "stock" && (
                <CsvImportButton
                  entityName="categories"
                  fields={importFields}
                  createRow={importCategory}
                  onComplete={() => {
                    parentLookup.reset()
                    reload()
                  }}
                />
              )}
              <Button size="action" onClick={() => navigate(`/category_form/new?kind=${kind}`)}>
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
        minWidth="820px"
        columnWidths={["280px", "200px", "200px", "110px", "80px"]}
        unlabelledColumns={["actions"]}
      />
    </div>
  )
}

const CategoriesPage = () => {
  const kind = useKind()
  return <Categories key={kind} kind={kind} />
}

export default CategoriesPage
