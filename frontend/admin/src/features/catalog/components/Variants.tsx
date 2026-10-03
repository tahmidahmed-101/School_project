import { useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { DownloadIcon, Layers, Loader2, Package, UploadIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { Combobox } from "@/components/common/ComboBox"
import { PageHeader } from "@/components/common/PageHeader"
import { StatusBadge } from "@/components/common/StatusBadge"
import { MoneyCell, ProductCell, TextCell } from "@/components/common/cells"
import { SortSelect } from "@/components/common/SortSelect"
import { DialogActions } from "@/components/common/FormDialog"
import { TextField } from "@/components/common/form-fields"
import { TableActions } from "@/components/common/TableActions"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { useListPage } from "@/hooks/use-list-page"
import { getApiErrorMessage } from "@/lib/api/client"
import type { Option } from "@/lib/types"
import { useLastValue } from "@/hooks/use-dialog-presence"

import { fetchAll } from "../slices/variantSlice"
import { deleteVariant, downloadVariantsExport, importVariants, updateVariant } from "../api"
import { ProductPickerDialog } from "./ProductPickerDialog"
import { VariantFormDialog } from "./VariantFormDialog"
import type { Product, ProductVariant, VariantImportResult } from "../types"
import { useCategoryOptions } from "../lib/useCategoryOptions"

const PAGE_SIZE = 25

const stockOptions: Option[] = [
  { label: "Out of stock", value: "out" },
  { label: "Low stock", value: "low" },
  { label: "In stock", value: "in" },
]
const statusOptions: Option[] = [
  { label: "Active", value: "true" },
  { label: "Inactive", value: "false" },
]
const preorderOptions: Option[] = [
  { label: "Pre-order (any)", value: "any" },
  { label: "Pre-order active", value: "active" },
  { label: "Pre-order inactive", value: "inactive" },
]
const orderingOptions: Option[] = [
  { label: "SKU A–Z", value: "sku" },
  { label: "Newest first", value: "-created_at" },
  { label: "Price low–high", value: "price" },
  { label: "Price high–low", value: "-price" },
]

const Variants = () => {
  useDocumentTitle("Variants")
  const dispatch = useAppDispatch()
  const canManage = useCan("catalog.manage")
  const variantState = useAppSelector((s) => s.variants)
  const { options: categoryOptions } = useCategoryOptions()

  const [category, setCategory] = useState<Option | null>(null)
  const [stock, setStock] = useState<Option | null>(null)
  const [status, setStatus] = useState<Option | null>(null)
  const [preorder, setPreorder] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(null)
  const [exporting, setExporting] = useState(false)
  const [editing, setEditing] = useState<ProductVariant | null>(null)
  // Creating a variant: first pick the product it belongs to, then fill in the variant form.
  const [pickingProduct, setPickingProduct] = useState(false)
  const [addingTo, setAddingTo] = useState<Product | null>(null)
  const addingShown = useLastValue(addingTo)
  const editingShown = useLastValue(editing)
  const [importOpen, setImportOpen] = useState(false)

  const list = useListPage({
    fetch: (p) => dispatch(fetchAll(p)),
    state: variantState,
    pageSize: PAGE_SIZE,
    params: {
      category_id: category?.value,
      stock_status: stock?.value,
      is_active: status?.value,
      preorder_only: preorder ? true : undefined,
      preorder_status: preorder && preorder.value !== "any" ? preorder.value : undefined,
      ordering: ordering?.value,
    },
  })

  const runExport = async (fmt: "csv" | "xlsx") => {
    setExporting(true)
    try {
      // The export endpoint honours search + category only (not stock/status filters).
      await downloadVariantsExport(fmt, {
        ...(list.debouncedSearch ? { search: list.debouncedSearch } : {}),
        ...(category ? { category_id: category.value } : {}),
      })
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Export failed"))
    } finally {
      setExporting(false)
    }
  }

  const columns: ColumnDef<ProductVariant>[] = [
    {
      id: "variant",
      header: "VARIANT",
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
            {row.original.primary_image ? (
              <img src={row.original.primary_image} alt="" className="size-full object-cover" />
            ) : (
              <Package className="size-4 text-muted-foreground" />
            )}
          </div>
          <ProductCell name={row.original.product_name} sku={row.original.sku} />
        </div>
      ),
    },
    {
      id: "options",
      header: "OPTIONS",
      cell: ({ row }) => (
        <TextCell value={[row.original.color, row.original.size].filter(Boolean).join(" / ")} />
      ),
    },
    {
      accessorKey: "barcode",
      header: "BARCODE",
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.barcode || "—"}</span>,
    },
    {
      id: "price",
      header: "PRICE",
      cell: ({ row }) => <MoneyCell value={row.original.effective_price} emphasis />,
    },
    {
      accessorKey: "stock",
      header: "AVAILABLE",
      cell: ({ row }) => (
        <span
          className={
            row.original.stock <= 0
              ? "text-sm font-medium text-destructive"
              : row.original.is_low_stock
                ? "text-sm font-medium text-amber-600 dark:text-amber-400"
                : "text-sm"
          }
        >
          {row.original.stock}
        </span>
      ),
    },
    {
      id: "status",
      header: "STATUS",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={row.original.is_active ? "active" : "inactive"} />
          {row.original.is_preorder_enabled && (
            <StatusBadge status="pre-order" tone={row.original.is_preorder_active ? "info" : "secondary"} />
          )}
        </div>
      ),
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => (
        <TableActions
          itemName={row.original.sku}
          viewUrl={`/product_detail/${row.original.product_id}`}
          onEdit={canManage ? () => setEditing(row.original) : undefined}
          onDelete={
            canManage
              ? async () => {
                  try {
                    await deleteVariant(row.original.id)
                    toast.success(`${row.original.sku} deactivated`)
                    list.reload()
                  } catch (err) {
                    toast.error(getApiErrorMessage(err, "Failed to delete variant"))
                  }
                }
              : undefined
          }
        />
      ),
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Variants"
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="primary" size="action" disabled={exporting}>
                  {exporting ? <Loader2 className="size-5 animate-spin" /> : <DownloadIcon className="size-5" />} Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void runExport("csv")}>CSV (.csv)</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void runExport("xlsx")}>Excel (.xlsx)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {canManage && (
              <Button variant="outline" size="action" onClick={() => setImportOpen(true)}>
                <UploadIcon className="size-5" /> Import
              </Button>
            )}
            {canManage && (
              <Button size="action" onClick={() => setPickingProduct(true)}>
                <PlusIcon className="size-5" /> Add Variant
              </Button>
            )}
          </>
        }
      />

      <FilterToolbar
        searchPlaceholder="Search SKU, barcode or product…"
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
              <Combobox placeholder="Stock" options={stockOptions} value={stock} onValueChange={setStock} />
            ),
          },
          {
            component: (
              <Combobox placeholder="Status" options={statusOptions} value={status} onValueChange={setStatus} />
            ),
          },
          {
            component: (
              <Combobox
                placeholder="Pre-order"
                options={preorderOptions}
                value={preorder}
                onValueChange={setPreorder}
              />
            ),
          },
          {
            component: (
              <SortSelect options={orderingOptions} value={ordering} onChange={setOrdering} />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={variantState.data}
        {...list.tableProps}
        bulk={
          canManage
            ? {
                noun: "variant",
                deleteRow: (v) => deleteVariant(v.id),
                activate: (rows) => Promise.all(rows.map((v) => updateVariant(v.id, { is_active: true }))),
                deactivate: (rows) => Promise.all(rows.map((v) => updateVariant(v.id, { is_active: false }))),
                onDone: list.reload,
              }
            : undefined
        }
        getRowLink={(v) => `/product_detail/${v.product_id}`}
        unlabelledColumns={["actions"]}
        emptyIcon={Layers}
        emptyTitle="No variants found"
        minWidth="1000px"
        columnWidths={["280px", "130px", "150px", "120px", "100px", "160px", "80px"]}
      />

      {canManage && <ImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={list.reload} />}
      {canManage && (
        <ProductPickerDialog
          open={pickingProduct}
          onOpenChange={setPickingProduct}
          title="Add variant"
          description="Choose the product this variant belongs to."
          onPick={(product) => {
            setPickingProduct(false)
            setAddingTo(product)
          }}
        />
      )}
      {/* Mounted on the last picked record, so the dialog can animate shut after it is cleared. */}
      {canManage && addingShown && (
        <VariantFormDialog
          open={Boolean(addingTo)}
          onOpenChange={(open) => !open && setAddingTo(null)}
          productId={addingShown.id}
          onSaved={list.reload}
        />
      )}
      {canManage && editingShown && (
        <VariantFormDialog
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          productId={editingShown.product_id}
          variant={editingShown}
          onSaved={list.reload}
        />
      )}
    </div>
  )
}

function ImportDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [fmt, setFmt] = useState<"csv" | "xlsx">("csv")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<VariantImportResult | null>(null)

  const close = (o: boolean) => {
    if (!o) {
      setFile(null)
      setResult(null)
    }
    onOpenChange(o)
  }

  const submit = async () => {
    if (!file) return
    setBusy(true)
    try {
      const res = await importVariants(file, fmt)
      setResult(res)
      toast.success(`Import finished: ${res.created} created, ${res.updated} updated`)
      onDone()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Import failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import variants</DialogTitle>
          <DialogDescription>
            Upload a file in the same layout as the export. Rows are matched by SKU: existing SKUs are updated, new
            ones created.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="import-format">Format</FieldLabel>
            <FieldContent>
              <Select value={fmt} onValueChange={(v) => setFmt(v as "csv" | "xlsx")}>
                <SelectTrigger id="import-format" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
          <TextField
            label="File"
            id="import-file"
            type="file"
            accept={fmt === "csv" ? ".csv,text/csv" : ".xlsx"}
            onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                  setResult(null)
                }}
            description="Tip: export first to get the expected columns."
          />
          {result && (
            <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
              <p>
                <span className="font-medium">{result.created}</span> created ·{" "}
                <span className="font-medium">{result.updated}</span> updated ·{" "}
                <span className={result.errors.length ? "font-medium text-destructive" : "font-medium"}>
                  {result.errors.length}
                </span>{" "}
                errors
              </p>
              {result.errors.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-destructive">
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row}
                      {e.sku ? ` (${e.sku})` : ""}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogActions
          onCancel={() => close(false)}
          cancelLabel="Close"
          onSubmit={submit}
          submitLabel="Import"
          submitting={busy}
          submitDisabled={!file}
        />
      </DialogContent>
    </Dialog>
  )
}

export default Variants
