import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { DownloadIcon, Layers, Loader2, Package, UploadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { PageHeading } from "@/components/common/PageHeading"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency } from "@/lib/format"

import { fetchAll } from "../slices/variantSlice"
import { downloadVariantsExport, importVariants } from "../api"
import type { ProductVariant, VariantImportResult } from "../types"
import { usePermission } from "../lib/usePermission"
import { useDebounced } from "../lib/useDebounced"
import { useCategoryOptions } from "../lib/useCategoryOptions"

type Option = { label: string; value: string }
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
  const canManage = usePermission("catalog.manage")
  const { data: variants, isFetchingList, error, totalItems } = useAppSelector((s) => s.variants)
  const { options: categoryOptions } = useCategoryOptions()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounced(search)
  const [category, setCategory] = useState<Option | null>(null)
  const [stock, setStock] = useState<Option | null>(null)
  const [status, setStatus] = useState<Option | null>(null)
  const [preorder, setPreorder] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const params = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      ...(category ? { category_id: category.value } : {}),
      ...(stock ? { stock_status: stock.value } : {}),
      ...(status ? { is_active: status.value } : {}),
      ...(preorder ? { preorder_only: true, ...(preorder.value !== "any" ? { preorder_status: preorder.value } : {}) } : {}),
      ...(ordering ? { ordering: ordering.value } : {}),
    }),
    [page, debouncedSearch, category, stock, status, preorder, ordering]
  )
  const load = useCallback(() => {
    dispatch(fetchAll(params))
  }, [dispatch, params])
  useEffect(() => {
    load()
  }, [load])

  const setFilter = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setPage(1)
  }

  const runExport = async (fmt: "csv" | "xlsx") => {
    setExporting(true)
    try {
      // The export endpoint honours search + category only (not stock/status filters).
      await downloadVariantsExport(fmt, {
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
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
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{row.original.product_name}</div>
            <div className="truncate font-mono text-xs text-muted-foreground">{row.original.sku}</div>
          </div>
        </div>
      ),
    },
    {
      id: "options",
      header: "OPTIONS",
      cell: ({ row }) => (
        <span className="text-sm">{[row.original.color, row.original.size].filter(Boolean).join(" / ") || "—"}</span>
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
      cell: ({ row }) => <span className="text-sm font-semibold">{formatCurrency(row.original.effective_price)}</span>,
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
      id: "product",
      header: "PRODUCT",
      cell: ({ row }) => (
        <Link to={`/product_detail/${row.original.product_id}`} className="text-sm text-primary hover:underline">
          Open
        </Link>
      ),
    },
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Variants" description="Every sellable SKU across the catalog, with live availability" />
        <div className="flex flex-wrap gap-2">
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
            <Button size="action" onClick={() => setImportOpen(true)}>
              <UploadIcon className="size-5" /> Import
            </Button>
          )}
        </div>
      </div>

      <FilterToolbar
        searchPlaceholder="Search SKU, barcode or product…"
        searchValue={search}
        onSearchChange={setFilter(setSearch)}
        filters={[
          {
            component: (
              <ExampleComboboxCustomItems
                placeholder="Category"
                frameworks={categoryOptions.map((o) => ({ label: o.label, value: o.value }))}
                value={category}
                onValueChange={setFilter(setCategory)}
              />
            ),
          },
          {
            component: (
              <ExampleComboboxCustomItems placeholder="Stock" frameworks={stockOptions} value={stock} onValueChange={setFilter(setStock)} />
            ),
          },
          {
            component: (
              <ExampleComboboxCustomItems placeholder="Status" frameworks={statusOptions} value={status} onValueChange={setFilter(setStatus)} />
            ),
          },
          {
            component: (
              <ExampleComboboxCustomItems
                placeholder="Pre-order"
                frameworks={preorderOptions}
                value={preorder}
                onValueChange={setFilter(setPreorder)}
              />
            ),
          },
          {
            component: (
              <ExampleComboboxCustomItems placeholder="Sort" frameworks={orderingOptions} value={ordering} onValueChange={setFilter(setOrdering)} />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={variants}
        isLoading={isFetchingList}
        error={error}
        onRetry={load}
        manualPagination
        pageSize={PAGE_SIZE}
        pageIndex={page - 1}
        pageCount={Math.max(1, Math.ceil(totalItems / PAGE_SIZE))}
        totalCount={totalItems}
        onPageChange={(i) => setPage(i + 1)}
        getRowLink={(v) => `/product_detail/${v.product_id}`}
        emptyIcon={Layers}
        emptyTitle="No variants found"
        minWidth="1000px"
        columnWidths={["280px", "130px", "150px", "120px", "100px", "160px", "90px"]}
      />

      {canManage && <ImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={load} />}
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
          <Field>
            <FieldLabel htmlFor="import-file">File</FieldLabel>
            <FieldContent>
              <Input
                id="import-file"
                type="file"
                accept={fmt === "csv" ? ".csv,text/csv" : ".xlsx"}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                  setResult(null)
                }}
              />
              <FieldDescription>Tip: export first to get the expected columns.</FieldDescription>
            </FieldContent>
          </Field>
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
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Close
          </Button>
          <Button onClick={submit} disabled={!file || busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default Variants
