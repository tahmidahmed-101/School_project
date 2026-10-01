import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { Boxes, Package, PlusIcon, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
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

import { deleteData, fetchAll } from "../slices/bundleSlice"
import { restoreBundle } from "../api"
import type { Bundle } from "../types"
import { usePermission } from "../lib/usePermission"
import { useDebounced } from "../lib/useDebounced"
import { DeletedToggle } from "@/components/common/DeletedToggle"

type Option = { label: string; value: string }
const PAGE_SIZE = 20

const orderingOptions: Option[] = [
  { label: "Newest first", value: "-created_at" },
  { label: "SKU A–Z", value: "sku" },
  { label: "Price low–high", value: "price" },
  { label: "Price high–low", value: "-price" },
]

const Bundles = () => {
  useDocumentTitle("Bundles")
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = usePermission("catalog.manage")
  const { data: bundles, isFetchingList, error, totalItems } = useAppSelector((s) => s.catalogBundles)

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounced(search)
  const [ordering, setOrdering] = useState<Option | null>(null)
  const [includeDeleted, setIncludeDeleted] = useState(false)

  const params = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      ...(ordering ? { ordering: ordering.value } : {}),
      ...(includeDeleted ? { include_deleted: true } : {}),
    }),
    [page, debouncedSearch, ordering, includeDeleted]
  )
  const load = useCallback(() => {
    dispatch(fetchAll(params))
  }, [dispatch, params])
  useEffect(() => {
    load()
  }, [load])

  const columns: ColumnDef<Bundle>[] = [
    {
      id: "name",
      header: "BUNDLE",
      cell: ({ row }) => {
        const img = row.original.images[0]?.url
        return (
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
              {img ? <img src={img} alt="" className="size-full object-cover" /> : <Boxes className="size-5 text-muted-foreground" />}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{row.original.name}</div>
              <div className="truncate font-mono text-xs text-muted-foreground">{row.original.sku}</div>
            </div>
          </div>
        )
      },
    },
    {
      id: "components",
      header: "COMPONENTS",
      cell: ({ row }) => (
        <span className="line-clamp-2 text-sm text-muted-foreground">
          {row.original.components.map((c) => `${c.quantity}× ${c.component_name}`).join(", ")}
        </span>
      ),
    },
    {
      id: "price",
      header: "PRICE",
      cell: ({ row }) => (
        <div className="text-sm">
          <span className="font-semibold">{formatCurrency(row.original.effective_price)}</span>
          {row.original.effective_price !== row.original.price && (
            <span className="ml-1.5 text-xs text-muted-foreground line-through">{formatCurrency(row.original.price)}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "available_stock",
      header: "AVAILABLE",
      cell: ({ row }) => (
        <span className={row.original.available_stock <= 0 ? "text-sm font-medium text-destructive" : "text-sm"}>
          {row.original.available_stock}
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
        const b = row.original
        if (b.deleted_at) {
          return canManage ? (
            <Button
              variant="outline"
              size="sm"
              onClick={async (e) => {
                e.stopPropagation()
                try {
                  await restoreBundle(b.id)
                  toast.success(`${b.name} restored`)
                  load()
                } catch (err) {
                  toast.error(getApiErrorMessage(err, "Failed to restore bundle"))
                }
              }}
            >
              <RotateCcw /> Restore
            </Button>
          ) : null
        }
        return (
          <TableActions
            itemName={b.name}
            viewUrl={`/product_detail/${b.product_id}`}
            editUrl={canManage ? `/bundles/${b.id}` : undefined}
            onDelete={
              canManage
                ? async () => {
                    try {
                      await dispatch(deleteData(b.id)).unwrap()
                      toast.success(`${b.name} deleted`)
                    } catch (err) {
                      toast.error(getApiErrorMessage(err, "Failed to delete bundle"))
                    }
                  }
                : undefined
            }
          />
        )
      },
    },
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading
          title="Bundles"
          description="Combo products sold as one SKU; stock is drawn from their component variants"
        />
        {canManage && (
          <Button size="action" onClick={() => navigate("/bundles/new")}>
            <PlusIcon className="size-5" /> New Bundle
          </Button>
        )}
      </div>

      <FilterToolbar
        searchPlaceholder="Search by SKU or name…"
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        filters={[
          {
            component: (
              <ExampleComboboxCustomItems
                placeholder="Sort"
                frameworks={orderingOptions}
                value={ordering}
                onValueChange={(v) => {
                  setOrdering(v)
                  setPage(1)
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
                          setPage(1)
                        }} />
                  ),
                },
              ]
            : []),
        ]}
      />

      <DataTable
        columns={columns}
        data={bundles}
        isLoading={isFetchingList}
        error={error}
        onRetry={load}
        manualPagination
        pageSize={PAGE_SIZE}
        pageIndex={page - 1}
        pageCount={Math.max(1, Math.ceil(totalItems / PAGE_SIZE))}
        totalCount={totalItems}
        onPageChange={(i) => setPage(i + 1)}
        getRowLink={canManage ? (b) => `/bundles/${b.id}` : undefined}
        emptyIcon={Package}
        emptyTitle="No bundles yet"
        emptyDescription={canManage ? "Combine existing variants into a bundle sold as one SKU." : undefined}
        emptyActionLabel={canManage ? "New bundle" : undefined}
        onEmptyAction={canManage ? () => navigate("/bundles/new") : undefined}
        minWidth="980px"
        columnWidths={["260px", "280px", "140px", "100px", "110px", "130px"]}
        unlabelledColumns={["actions"]}
      />
    </div>
  )
}

export default Bundles
