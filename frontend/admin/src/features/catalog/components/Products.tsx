import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { Boxes, Package, PlusIcon, SlidersHorizontal, Star, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { Combobox } from "@/components/common/ComboBox"
import { PageHeader } from "@/components/common/PageHeader"
import { TableActions } from "@/components/common/TableActions"
import { SaveSwitch } from "@/components/common/SaveSwitch"
import { ProductCell } from "@/components/common/cells"
import { SortSelect } from "@/components/common/SortSelect"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { RestoreDeletedButton } from "@/components/common/RestoreDeletedButton"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { useDelayedUnmount, useLastValue } from "@/hooks/use-dialog-presence"
import { useKind, type Kind, withKind } from "@/hooks/use-kind"
import { useListPage } from "@/hooks/use-list-page"
import { formatCurrency, formatDate, getDefaultCurrency } from "@/lib/format"
import { createImportLookup, splitList } from "@/lib/importLookup"
import type { Option } from "@/lib/types"
import { StockMovementDialog } from "@/features/inventory/components/StockMovementDialog"
import { useWarehouses } from "@/features/inventory/lib/useWarehouses"

import { fetchAll, deleteData } from "../slices/productSlice"
import { bulkProductStatus, createProduct, fetchAllCategories, restoreProduct, updateProduct } from "../api"
import { productTypeOptions, type Product, type ProductPayload } from "../types"
import { variantCount } from "../lib/productKind"
import { useCategoryOptions } from "../lib/useCategoryOptions"
import { StockDeleteDialog } from "./StockDeleteDialog"

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

const preorderTypeOptions = productTypeOptions.filter((o) => o.value !== "bundle")

const stockColumn: ColumnDef<Product> = {
  accessorKey: "total_stock",
  header: "STOCK",
  cell: ({ row }) => (
    <span className={(row.original.total_stock ?? 0) <= 0 ? "text-sm font-medium text-destructive" : "text-sm"}>
      {row.original.total_stock ?? 0}
    </span>
  ),
}

const orderingColumn: ColumnDef<Product> = {
  id: "ordering",
  header: "ORDERING",
  cell: ({ row }) => {
    const variants = row.original.variants
    const closes = variants.find((v) => v.preorder_end_date)?.preorder_end_date
    return (
      <div className="flex flex-col text-sm">
        <span>{variants.some((v) => v.is_preorder_active) ? "Open" : "Closed"}</span>
        <span className="text-xs text-muted-foreground">{closes ? `Until ${formatDate(closes)}` : "No dates set"}</span>
      </div>
    )
  },
}

const addedByColumn: ColumnDef<Product> = {
  id: "added_by",
  header: "ADDED BY",
  cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.added_by ?? "—"}</span>,
}

const infoColumn: ColumnDef<Product> = {
  id: "info",
  header: "INFO",
  cell: ({ row }) => {
    const { units_sold, price, average_rating, review_count } = row.original
    return (
      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
        <span>
          Sales: <span className="font-medium text-foreground">{units_sold}</span>
        </span>
        <span>
          Base price: <span className="font-medium text-foreground">{price === null ? "—" : formatCurrency(price)}</span>
        </span>
        <span className="flex items-center gap-1">
          Rating:
          {average_rating === null ? (
            <span>No reviews</span>
          ) : (
            <>
              <Star className="size-3 fill-amber-400 text-amber-400" />
              <span className="font-medium text-foreground">{average_rating.toFixed(1)}</span>
              <span>({review_count})</span>
            </>
          )}
        </span>
      </div>
    )
  },
}

const Products = ({ kind }: { kind: Kind }) => {
  const isStock = kind === "stock"
  const title = kind === "preorder" ? "Pre-order products" : "Products"
  useDocumentTitle(title)
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = useCan("catalog.manage")
  const canAdjust = useCan("inventory.adjust", "inventory.manage")
  const { warehouses } = useWarehouses(kind)
  const [deleting, setDeleting] = useState<Product | null>(null)
  const [adjusting, setAdjusting] = useState<Product | null>(null)
  // Kept mounted, still showing its product, while the delete dialog animates shut.
  const deleteTarget = useLastValue(deleting)
  const deleteMounted = useDelayedUnmount(deleting !== null)
  const productState = useAppSelector((s) => s.products)
  const products = productState.data
  const { options: categoryOptions, nameById } = useCategoryOptions(kind)

  // CSV import (stock page only): simple products, one variant created from price/SKU in the same call.
  const categoryLookup = useMemo(
    () => createImportLookup("Category", () => fetchAllCategories("stock"), (c) => [c.name, c.slug]),
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


  // A one-variant product needs no picking; otherwise the picker lists this product's variants.
  const adjustVariant = useMemo(() => {
    const only = adjusting?.variants.length === 1 ? adjusting.variants[0] : null
    return only ? { id: only.id, sku: only.sku, product_name: adjusting!.name } : null
  }, [adjusting])

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
      cell: ({ row }) => {
        const count = variantCount(row.original)
        return <ProductCell name={row.original.name} sub={count === 0 ? "No variants" : `${count} variant${count === 1 ? "" : "s"}`} />
      },
    },
    addedByColumn,
    infoColumn,
    {
      id: "category",
      header: "CATEGORY",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{nameById.get(row.original.category_id) ?? "—"}</span>
      ),
    },
    isStock ? stockColumn : orderingColumn,
    {
      id: "published",
      header: "PUBLISHED",
      cell: ({ row }) => (
        <SaveSwitch
          // Remounted when the list brings a new value, e.g. after a bulk activate.
          key={`${row.original.id}-${row.original.is_active}`}
          label={`Published: ${row.original.name}`}
          checked={row.original.is_active}
          disabled={!canManage}
          save={(next) => updateProduct(row.original.id, { is_active: next })}
          failure={`Failed to update ${row.original.name}`}
        />
      ),
    },
    {
      id: "featured",
      header: "FEATURED",
      cell: ({ row }) => (
        <SaveSwitch
          key={`${row.original.id}-${row.original.featured}`}
          label={`Featured: ${row.original.name}`}
          checked={row.original.featured}
          disabled={!canManage}
          save={(next) => updateProduct(row.original.id, { featured: next })}
          failure={`Failed to update ${row.original.name}`}
        />
      ),
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => {
        const product = row.original
        return (
          <TableActions
            itemName={product.name}
            viewUrl={withKind(`/product_detail/${product.id}`, kind)}
            editUrl={canManage && product.product_type !== "bundle" ? withKind(`/product_form/${product.id}`, kind) : undefined}
            actions={[
              // A bundle holds no stock of its own; its components are adjusted instead.
              ...(canAdjust && product.product_type !== "bundle"
                ? [{ label: "Adjust", icon: SlidersHorizontal, onSelect: () => setAdjusting(product) }]
                : []),
              // The delete dialog does its own confirming, so it is not TableActions' onDelete.
              ...(canManage
                ? [{ label: "Delete", icon: Trash2Icon, destructive: true, onSelect: () => setDeleting(product) }]
                : []),
            ]}
          />
        )
      },
    },
  ]

  const widths = [
    "70px",
    "240px",
    "150px",
    "180px",
    "150px",
    isStock ? "80px" : "140px",
    "110px",
    "100px",
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
                params={{ category_type: kind }}
                restore={(item) => restoreProduct(item.id)}
                label={(item) => item.name}
                image={(item) => item.primary_image}
                onRestored={list.reload}
              />
              {isStock && (
                <>
                  <Button variant="outline" size="action" onClick={() => navigate("/bundles/new")}>
                    <Boxes className="size-5" /> New Bundle
                  </Button>
                  <CsvImportButton
                    entityName="products"
                    fields={importFields}
                    createRow={(payload) => createProduct(payload as ProductPayload)}
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
                options={isStock ? productTypeOptions : preorderTypeOptions}
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
        getRowLink={(p) => withKind(`/product_detail/${p.id}`, kind)}
        unlabelledColumns={["image"]}
        emptyIcon={Package}
        emptyTitle="No products found"
        emptyDescription="Try a different search or filter, or add a new product."
        minWidth="1300px"
        columnWidths={widths}
      />

      {deleteMounted && deleteTarget && (
        <StockDeleteDialog
          key={deleteTarget.id}
          open={deleting !== null}
          name={deleteTarget.name}
          scope={{ product_id: deleteTarget.id }}
          kind={kind}
          remove={() => dispatch(deleteData(deleteTarget.id)).unwrap()}
          onDeleted={() => undefined}
          onClose={() => setDeleting(null)}
          onStockChanged={list.reload}
        />
      )}
      <StockMovementDialog
        mode={adjusting ? "adjust" : null}
        onOpenChange={(open) => !open && setAdjusting(null)}
        warehouses={warehouses}
        variant={adjustVariant}
        kind={kind}
        productId={adjusting?.id}
        onDone={list.reload}
      />
    </div>
  )
}

const ProductsPage = () => {
  const kind = useKind()
  return <Products key={kind} kind={kind} />
}

export default ProductsPage
