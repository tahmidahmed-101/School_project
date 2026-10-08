import { useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { Boxes, Package, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { Combobox } from "@/components/common/ComboBox"
import { PageHeader } from "@/components/common/PageHeader"
import { TableActions } from "@/components/common/TableActions"
import { ActiveStatusBadge, ProductCell } from "@/components/common/cells"
import { SortSelect } from "@/components/common/SortSelect"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { RestoreDeletedButton } from "@/components/common/RestoreDeletedButton"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { useListPage } from "@/hooks/use-list-page"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency, getDefaultCurrency } from "@/lib/format"
import { createImportLookup, splitList } from "@/lib/importLookup"
import type { Option } from "@/lib/types"

import { fetchAll, deleteData } from "../slices/productSlice"
import { bulkProductStatus, createProduct, fetchAllCategories, restoreProduct } from "../api"
import { productTypeOptions, type Product, type ProductPayload } from "../types"
import { useCategoryOptions } from "../lib/useCategoryOptions"
import { isBlockedByStock, stockLevelsPath } from "../deleteGuard"

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
  // One list per kind: /products is stock, /preorder_products is pre-order.
  const kind = useLocation().pathname.startsWith("/preorder_products") ? "preorder" : "stock"
  const title = kind === "preorder" ? "Pre-order products" : "Products"
  useDocumentTitle(title)
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = useCan("catalog.manage")
  const productState = useAppSelector((s) => s.products)
  const products = productState.data
  const { options: allCategoryOptions, nameById } = useCategoryOptions()
  const categoryOptions = useMemo(
    () => allCategoryOptions.filter((o) => o.category.category_type === kind),
    [allCategoryOptions, kind]
  )

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
      { key: "price", label: `Price (${getDefaultCurrency()})`, required: true, type: "number", aliases: ["price", "selling price", "mrp"], example: "2450" },
      { key: "sku", label: "SKU", aliases: ["product code"], example: "PJ-NAVY-001" },
      { key: "cost_price", label: `Cost price (${getDefaultCurrency()})`, type: "number", aliases: ["cost price", "cost", "purchase price"], example: "1600" },
      { key: "discount_price", label: `Discount price (${getDefaultCurrency()})`, type: "number", aliases: ["discount price", "sale price", "offer price"], example: "2200" },
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

  const [category, setCategory] = useState<Option | null>(null)
  const [productType, setProductType] = useState<Option | null>(null)
  const [status, setStatus] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(null)

  const list = useListPage({
    fetch: (p) => dispatch(fetchAll(p)),
    state: productState,
    params: {
      category_id: category?.value,
      product_type: productType?.value,
      category_type: kind,
      is_active: status?.value,
      ordering: ordering?.value,
    },
  })


  const handleDelete = async (product: Product) => {
    try {
      await dispatch(deleteData(product.id)).unwrap()
      toast.success(`${product.name} deleted`)
    } catch (err) {
      if (isBlockedByStock(err)) {
        // Stock has to be cleared through the existing write-off flow first.
        toast.error(getApiErrorMessage(err, "This product still has stock"), {
          duration: 15000,
          action: { label: "Open stock levels", onClick: () => navigate(stockLevelsPath(product.name)) },
        })
        return
      }
      toast.error(getApiErrorMessage(err, "Failed to delete product"))
    }
  }

  const columns: ColumnDef<Product>[] = [
    {
      id: "image",
      header: "IMAGE",
      cell: ({ row }) => (
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/40">
          {row.original.primary_image ? (
            <img loading="lazy" decoding="async"
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
        <ProductCell
          name={row.original.name}
          sub={`${row.original.variants.length} variant${row.original.variants.length === 1 ? "" : "s"}`}
        />
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
          <div className="flex flex-col text-sm">
            <span className="font-semibold">
              {formatCurrency(row.original.discount_price ?? row.original.price)}
            </span>
            {row.original.discount_price && (
              <span className="text-xs text-muted-foreground line-through">
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
      id: "status",
      header: "STATUS",
      cell: ({ row }) => <ActiveStatusBadge deleted={row.original.deleted_at} active={row.original.is_active} />,
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => {
        const product = row.original
        return (
          <TableActions
            itemName={product.name}
            viewUrl={`/product_detail/${product.id}`}
            editUrl={canManage && product.product_type !== "bundle" ? `/product_form/${product.id}` : undefined}
            onDelete={canManage ? () => handleDelete(product) : undefined}
          />
        )
      },
    },
  ]

  const widths = [
    "70px",
    "240px",
    "150px",
    "140px",
    "80px",
    "110px",
    "80px",
  ]

  return (
    <div className="section-container">
      <PageHeader
        title={title}
        actions={
          canManage && (
            <>
              <RestoreDeletedButton<Product>
                noun="products"
                endpoint="/admin/catalog/products/"
                restore={(item) => restoreProduct(item.id)}
                label={(item) => item.name}
                image={(item) => item.primary_image}
                onRestored={list.reload}
              />
              {kind === "stock" && (
                <>
                  <Button variant="outline" size="action" onClick={() => navigate("/bundles/new")}>
                    <Boxes className="size-5" /> New Bundle
                  </Button>
                  <CsvImportButton
                    entityName="products"
                    fields={importFields}
                    createRow={(payload) => createProduct({ ...(payload as ProductPayload), product_type: "simple" })}
                    onComplete={() => {
                      categoryLookup.reset()
                      list.reload()
                    }}
                  />
                </>
              )}
              <Button size="action" onClick={() => navigate(`/product_form/new?kind=${kind}`)}>
                <PlusIcon className="size-5" /> Add Product
              </Button>
            </>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search products by name…"
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[
          {
            component: (
              <Combobox
                placeholder="Category"
                options={categoryOptions.map((o) => ({ label: `${"— ".repeat(o.depth)}${o.label}`, value: o.value }))}
                value={category}
                onValueChange={setCategory}
              />
            ),
          },
          {
            component: (
              <Combobox
                placeholder="Type"
                options={productTypeOptions}
                value={productType}
                onValueChange={setProductType}
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
          { component: <SortSelect options={orderingOptions} value={ordering} onChange={setOrdering} /> },
        ]}
      />

      <DataTable
        columns={columns}
        bulk={
          canManage
            ? {
                noun: "product",
                deleteRow: (p) => dispatch(deleteData(p.id)).unwrap(),
                activate: (rows) => bulkProductStatus(rows.map((r) => r.id), true),
                deactivate: (rows) => bulkProductStatus(rows.map((r) => r.id), false),
                onDone: list.reload,
              }
            : undefined
        }
        data={products}
        {...list.tableProps}
        getRowLink={(p) => `/product_detail/${p.id}`}
        unlabelledColumns={["image"]}
        emptyIcon={Package}
        emptyTitle="No products found"
        emptyDescription="Try a different search or filter, or add a new product."
        minWidth="1000px"
        columnWidths={widths}
      />
    </div>
  )
}

export default Products
