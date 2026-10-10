import { useState } from "react"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { Boxes, Package, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { TableActions } from "@/components/common/TableActions"
import { ActiveStatusBadge, ProductCell } from "@/components/common/cells"
import { SortSelect } from "@/components/common/SortSelect"
import { RestoreDeletedButton } from "@/components/common/RestoreDeletedButton"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { useListPage } from "@/hooks/use-list-page"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency } from "@/lib/format"
import type { Option } from "@/lib/types"

import { deleteData, fetchAll } from "../slices/bundleSlice"
import { restoreBundle, updateBundle } from "../api"
import type { Bundle } from "../types"

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
  const canManage = useCan("catalog.manage")
  const bundleState = useAppSelector((s) => s.catalogBundles)
  const [ordering, setOrdering] = useState<Option | null>(null)

  const list = useListPage({
    fetch: (p) => dispatch(fetchAll(p)),
    state: bundleState,
    params: { ordering: ordering?.value },
  })


  const handleDelete = async (b: Bundle) => {
    try {
      await dispatch(deleteData(b.id)).unwrap()
      toast.success(`${b.name} deleted`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete bundle"))
    }
  }

  const columns: ColumnDef<Bundle>[] = [
    {
      id: "name",
      header: "BUNDLE",
      cell: ({ row }) => {
        const img = row.original.images[0]?.url
        return (
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
              {img ? <img loading="lazy" decoding="async" src={img} alt="" className="size-full object-cover" /> : <Boxes className="size-5 text-muted-foreground" />}
            </div>
            <ProductCell name={row.original.name} sku={row.original.sku} />
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
      cell: ({ row }) => <ActiveStatusBadge deleted={row.original.deleted_at} active={row.original.is_active} />,
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => {
        const b = row.original
        return (
          <TableActions
            itemName={b.name}
            viewUrl={`/product_detail/${b.product_id}`}
            editUrl={canManage ? `/bundles/${b.id}` : undefined}
            onDelete={canManage ? () => handleDelete(b) : undefined}
          />
        )
      },
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Bundles"
        actions={
          canManage && (
            <>
              <RestoreDeletedButton<Bundle>
                noun="bundles"
                endpoint="/admin/catalog/bundles/"
                restore={(item) => restoreBundle(item.id)}
                label={(item) => item.name}
                sub={(item) => item.sku}
                onRestored={list.reload}
              />
              <Button size="action" onClick={() => navigate("/bundles/new")}>
                <PlusIcon className="size-5" /> New Bundle
              </Button>
            </>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search by SKU or name…"
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[
          { component: <SortSelect options={orderingOptions} value={ordering} onChange={setOrdering} /> },
        ]}
      />

      <DataTable
        columns={columns}
        bulk={
          canManage
            ? {
        noun: "bundle",
        deleteRow: (b) => dispatch(deleteData(b.id)).unwrap(),
        activate: (rows) => Promise.all(rows.map((b) => updateBundle(b.id, { is_active: true }))),
        deactivate: (rows) => Promise.all(rows.map((b) => updateBundle(b.id, { is_active: false }))),
        onDone: list.reload,
      }
            : undefined
        }
        data={bundleState.data}
        {...list.tableProps}
        getRowLink={canManage ? (b) => `/bundles/${b.id}` : undefined}
        emptyIcon={Package}
        emptyTitle="No bundles yet"
        emptyDescription={canManage ? "Combine existing variants into a bundle sold as one SKU." : undefined}
        emptyActionLabel={canManage ? "New bundle" : undefined}
        onEmptyAction={canManage ? () => navigate("/bundles/new") : undefined}
        minWidth="980px"
        columnWidths={["240px", "340px", "140px", "100px", "110px", "80px"]}
        unlabelledColumns={["actions"]}
      />
    </div>
  )
}

export default Bundles
