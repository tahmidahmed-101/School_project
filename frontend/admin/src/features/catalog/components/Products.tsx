import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { Boxes, Package, PlusIcon, RotateCcw, ToggleLeft, ToggleRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { PageHeading } from "@/components/common/PageHeading"
import { StatusBadge } from "@/components/common/StatusBadge"
import { TableActions } from "@/components/common/TableActions"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency } from "@/lib/format"

import { fetchAll, deleteData } from "../slices/productSlice"
import { bulkProductStatus, createProduct, fetchAllCategories, restoreProduct } from "../api"
import { categoryTypeOptions, productTypeOptions, type Product, type ProductPayload } from "../types"
import { usePermission } from "../lib/usePermission"
import { useDebounced } from "../lib/useDebounced"
import { useCategoryOptions } from "../lib/useCategoryOptions"
import { DeletedToggle } from "@/components/common/DeletedToggle"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { createImportLookup, splitList } from "../lib/importLookup"

type Option = { label: string; value: string }

const PAGE_SIZE = 20

const statusOptions: Option[] = [
  { label: "Active", value: "true" },
  { label: "Inactive", value: "false" },
]

const orderingOptions: Option[] = [
  { label: "Newest first", value: "-created_at" },
  { label: "Oldest first", value: "created_at" },
  { label: "Name A–Z", value: "name" },
  { label: "Name Z–A", value: "-name" },
]

const Products = () => {
  useDocumentTitle("Products")
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = usePermission("catalog.manage")
  const { data: products, isFetchingList, error, totalItems } = useAppSelector((s) => s.products)
  const { options: categoryOptions, nameById } = useCategoryOptions()

  // CSV import: simple products only (one variant created from price/SKU in the same call).
  const categoryLookup = useMemo(
    () => createImportLookup("Category", () => fetchAllCategories(), (c) => [c.name, c.slug]),
    []
  )
  const importFields = useMemo<ImportField[]>(
    () => [
      { key: "name", label: "Name", required: true, aliases: ["product", "product name", "title"], example: "Cotton Panjabi - Navy" },
      {
        key: "category_id",
        label: "Category",
        required: true,
        aliases: ["category name", "category slug", "category id"],
        example: "Panjabi & Kurta",
        resolve: categoryLookup.resolve,
      },
      { key: "price", label: "Price (BDT)", required: true, type: "number", aliases: ["price", "selling price", "mrp"], example: "2450" },
      { key: "sku", label: "SKU", aliases: ["product code"], example: "PJ-NAVY-001" },
      { key: "cost_price", label: "Cost price (BDT)", type: "number", aliases: ["cost price", "cost", "purchase price"], example: "1600" },
      { key: "discount_price", label: "Discount price (BDT)", type: "number", aliases: ["discount price", "sale price", "offer price"], example: "2200" },
      { key: "description", label: "Description", example: "Soft cotton panjabi with embroidered placket, ideal for Eid." },
      {
        key: "highlights",
        label: "Highlights",
        aliases: ["features"],
        example: "100% cotton; Regular fit; Made in Bangladesh",
        // Separated by ";" or "|" (commas are kept, highlights are sentences).
        resolve: (raw: string) => splitList(raw),
      },
      { key: "meta_keywords", label: "Meta keywords", aliases: ["keywords", "tags"], example: "panjabi, eid, cotton" },
    ],
    [categoryLookup]
  )

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounced(search)
  const [category, setCategory] = useState<Option | null>(null)
  const [productType, setProductType] = useState<Option | null>(null)
  const [categoryType, setCategoryType] = useState<Option | null>(null)
  const [status, setStatus] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(null)
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)

  const params = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      ...(category ? { category_id: category.value } : {}),
      ...(productType ? { product_type: productType.value } : {}),
      ...(categoryType ? { category_type: categoryType.value } : {}),
      ...(status ? { is_active: status.value } : {}),
      ...(ordering ? { ordering: ordering.value } : {}),
      ...(includeDeleted ? { include_deleted: true } : {}),
    }),
    [page, debouncedSearch, category, productType, categoryType, status, ordering, includeDeleted]
  )

  const load = useCallback(() => {
    dispatch(fetchAll(params))
  }, [dispatch, params])

  useEffect(() => {
    load()
  }, [load])

  // Any filter change returns to page 1 and drops a selection that may no longer be visible.
  const resetPaging = () => {
    setPage(1)
    setSelected([])
  }

  const toggleSelected = (id: string, checked: boolean) =>
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))

  const selectable = products.filter((p) => !p.deleted_at)
  const allSelected = selectable.length > 0 && selectable.every((p) => selected.includes(p.id))

  const runBulk = async (isActive: boolean) => {
    setBulkBusy(true)
    try {
      const res = await bulkProductStatus(selected, isActive)
      toast.success(`${res.affected} product(s) ${isActive ? "activated" : "deactivated"}`)
      setSelected([])
      load()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Bulk update failed"))
    } finally {
      setBulkBusy(false)
    }
  }

  const handleRestore = async (product: Product) => {
    try {
      await restoreProduct(product.id)
      toast.success(`${product.name} restored`)
      load()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to restore product"))
    }
  }

  const columns: ColumnDef<Product>[] = [
    ...(canManage
      ? [
          {
            id: "select",
            header: () => (
              <Checkbox
                aria-label="Select all on this page"
                checked={allSelected}
                onCheckedChange={(v) => setSelected(v ? selectable.map((p) => p.id) : [])}
              />
            ),
            cell: ({ row }: { row: { original: Product } }) =>
              row.original.deleted_at ? null : (
                <Checkbox
                  aria-label={`Select ${row.original.name}`}
                  checked={selected.includes(row.original.id)}
                  onCheckedChange={(v) => toggleSelected(row.original.id, Boolean(v))}
                />
              ),
          } as ColumnDef<Product>,
        ]
      : []),
    {
      id: "image",
      header: "IMAGE",
      cell: ({ row }) => (
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/40">
          {row.original.primary_image ? (
            <img
              src={row.original.primary_image}
              alt={row.original.name}
              className="size-full object-cover"
              onError={(e) => ((e.target as HTMLElement).style.display = "none")}
            />
          ) : (
            <Package className="size-5 text-muted-foreground/60" />
          )}
        </div>
      ),
    },
    {
      accessorKey: "name",
      header: "PRODUCT",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{row.original.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {row.original.variants.length} variant{row.original.variants.length === 1 ? "" : "s"}
          </div>
        </div>
      ),
    },
    {
      id: "category",
      header: "CATEGORY",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{nameById.get(row.original.category_id) ?? "—"}</span>
      ),
    },
    {
      id: "price",
      header: "PRICE",
      cell: ({ row }) =>
        row.original.price === null ? (
          <span className="text-sm text-muted-foreground">No price</span>
        ) : (
          <div className="text-sm">
            <span className="font-semibold">
              {formatCurrency(row.original.discount_price ?? row.original.price)}
            </span>
            {row.original.discount_price && (
              <span className="ml-1.5 text-xs text-muted-foreground line-through">
                {formatCurrency(row.original.price)}
              </span>
            )}
          </div>
        ),
    },
    {
      accessorKey: "total_stock",
      header: "STOCK",
      cell: ({ row }) => (
        <span className={row.original.total_stock <= 0 ? "text-sm font-medium text-destructive" : "text-sm"}>
          {row.original.total_stock}
        </span>
      ),
    },
    {
      accessorKey: "product_type",
      header: "TYPE",
      cell: ({ row }) => <span className="text-sm capitalize">{row.original.product_type}</span>,
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
        const product = row.original
        if (product.deleted_at) {
          return canManage ? (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                void handleRestore(product)
              }}
            >
              <RotateCcw /> Restore
            </Button>
          ) : null
        }
        return (
          <TableActions
            itemName={product.name}
            viewUrl={`/product_detail/${product.id}`}
            editUrl={canManage && product.product_type !== "bundle" ? `/product_form/${product.id}` : undefined}
            onDelete={
              canManage
                ? async () => {
                    try {
                      await dispatch(deleteData(product.id)).unwrap()
                      toast.success(`${product.name} deleted`)
                    } catch (err) {
                      toast.error(getApiErrorMessage(err, "Failed to delete product"))
                    }
                  }
                : undefined
            }
          />
        )
      },
    },
  ]

  const widths = [
    ...(canManage ? ["48px"] : []),
    "70px",
    "240px",
    "150px",
    "140px",
    "80px",
    "90px",
    "110px",
    "130px",
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Products" description="Manage your product catalog, pricing and variants" />
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="action" onClick={() => navigate("/bundles/new")}>
              <Boxes className="size-5" /> New Bundle
            </Button>
            <CsvImportButton
              entityName="products"
              fields={importFields}
              createRow={(payload) => createProduct({ ...(payload as ProductPayload), product_type: "simple" })}
              onComplete={() => {
                categoryLookup.reset()
                load()
              }}
            />
            <Button size="action" onClick={() => navigate("/product_form/new")}>
              <PlusIcon className="size-5" /> Add Product
            </Button>
          </div>
        )}
      </div>

      <FilterToolbar
        searchPlaceholder="Search products by name…"
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
                frameworks={categoryOptions.map((o) => ({ label: `${"— ".repeat(o.depth)}${o.label}`, value: o.value }))}
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
                placeholder="Type"
                frameworks={productTypeOptions}
                value={productType}
                onValueChange={(v) => {
                  setProductType(v)
                  resetPaging()
                }}
              />
            ),
          },
          {
            component: (
              <ExampleComboboxCustomItems
                placeholder="Category type"
                frameworks={categoryTypeOptions}
                value={categoryType}
                onValueChange={(v) => {
                  setCategoryType(v)
                  resetPaging()
                }}
              />
            ),
          },
          {
            component: (
              <ExampleComboboxCustomItems
                placeholder="Status"
                frameworks={statusOptions}
                value={status}
                onValueChange={(v) => {
                  setStatus(v)
                  resetPaging()
                }}
              />
            ),
          },
          {
            component: (
              <ExampleComboboxCustomItems
                placeholder="Sort"
                frameworks={orderingOptions}
                value={ordering}
                onValueChange={(v) => {
                  setOrdering(v)
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
          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => runBulk(true)}>
            <ToggleRight /> Activate
          </Button>
          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => runBulk(false)}>
            <ToggleLeft /> Deactivate
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={products}
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
        getRowLink={(p) => `/product_detail/${p.id}`}
        unlabelledColumns={["select", "image"]}
        emptyIcon={Package}
        emptyTitle="No products found"
        emptyDescription="Try a different search or filter, or add a new product."
        minWidth="1100px"
        columnWidths={widths}
      />
    </div>
  )
}

export default Products
