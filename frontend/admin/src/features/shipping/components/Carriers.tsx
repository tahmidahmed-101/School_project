import { useCallback, useEffect, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { PlusIcon, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeading } from "@/components/common/PageHeading"
import { StatusBadge } from "@/components/common/StatusBadge"
import { TableActions } from "@/components/common/TableActions"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { createCarrier, deleteCarrier, fetchCarriers, restoreCarrier } from "@/features/shipping/slices/carrierSlice"
import { CARRIER_PROVIDER_OPTIONS, type Carrier, type CarrierPayload } from "@/features/shipping/types"
import { useCan } from "@/features/sales/shared/useCan"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { CarrierFormDialog } from "./CarrierFormDialog"
import { DeletedToggle } from "@/components/common/DeletedToggle"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"

const PAGE_SIZE = 20
// API keys/secrets are deliberately not importable: set them per carrier in the form.
const importFields: ImportField[] = [
  { key: "name", label: "Name", required: true, aliases: ["carrier", "carrier name"], example: "eCourier" },
  {
    key: "code",
    label: "Provider",
    type: "enum",
    options: CARRIER_PROVIDER_OPTIONS.map((o) => o.value),
    aliases: ["code", "provider code"],
    example: "manual",
  },
  { key: "phone", label: "Phone", example: "+8809612345678" },
  { key: "contact_email", label: "Contact email", aliases: ["email"], example: "support@ecourier.com.bd" },
  { key: "api_base_url", label: "API base URL", aliases: ["api url", "base url"], example: "https://api.ecourier.com.bd" },
  {
    key: "is_integration_enabled",
    label: "Integration enabled",
    type: "boolean",
    aliases: ["integration", "api enabled"],
    example: "no",
  },
]

const providerLabel = (code: string) => CARRIER_PROVIDER_OPTIONS.find((o) => o.value === code)?.label ?? code

const Carriers = () => {
  useDocumentTitle("Carriers")

  const dispatch = useAppDispatch()
  const canUpdate = useCan("shipments.update")
  const { data: carriers, isFetchingList, error, totalItems, meta } = useAppSelector((state) => state.carriers)

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [showDeleted, setShowDeleted] = useState(false)
  const [editing, setEditing] = useState<Carrier | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => {
    const next = search.trim()
    if (next === debouncedSearch) return
    const t = setTimeout(() => {
      setDebouncedSearch(next)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search, debouncedSearch])

  const load = useCallback(
    () =>
      dispatch(
        fetchCarriers({
          page,
          page_size: PAGE_SIZE,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(showDeleted ? { include_deleted: true } : {}),
        })
      ),
    [dispatch, page, debouncedSearch, showDeleted]
  )

  useEffect(() => {
    const request = load()
    return () => request.abort()
  }, [load])

  const openForm = (carrier: Carrier | null) => {
    setEditing(carrier)
    setFormOpen(true)
  }

  const handleDelete = async (carrier: Carrier) => {
    try {
      await dispatch(deleteCarrier(carrier.id)).unwrap()
      toast.success(`${carrier.name} deleted`)
      load()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete carrier"))
    }
  }

  const handleRestore = async (carrier: Carrier) => {
    try {
      await dispatch(restoreCarrier(carrier.id)).unwrap()
      toast.success(`${carrier.name} restored`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to restore carrier"))
    }
  }

  const columns: ColumnDef<Carrier>[] = [
    {
      accessorKey: "name",
      header: "NAME",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">{providerLabel(row.original.code)}</p>
        </div>
      ),
    },
    {
      id: "contact",
      header: "CONTACT",
      cell: ({ row }) => (
        <div className="min-w-0 text-sm">
          <p className="truncate">{row.original.phone || "—"}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.contact_email}</p>
        </div>
      ),
    },
    {
      id: "integration",
      header: "INTEGRATION",
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge
            status={row.original.is_integration_enabled ? "enabled" : "disabled"}
            tone={row.original.is_integration_enabled ? "success" : "secondary"}
          />
          <span className="text-xs text-muted-foreground">
            {row.original.has_api_key ? "API key stored" : "No API key"}
          </span>
        </div>
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
    ...(canUpdate
      ? [
          {
            id: "actions",
            header: "ACTION",
            cell: ({ row }) =>
              row.original.deleted_at ? (
                <Button
                  variant="ghost"
                  size="sm"
                  data-no-row-click="true"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRestore(row.original)
                  }}
                >
                  <RotateCcw className="size-3.5" />
                  Restore
                </Button>
              ) : (
                <TableActions
                  itemName={row.original.name}
                  onEdit={() => openForm(row.original)}
                  onDelete={() => handleDelete(row.original)}
                />
              ),
          } satisfies ColumnDef<Carrier>,
        ]
      : []),
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Carriers" description="Courier partners used to ship orders." />
        {canUpdate && (
          <div className="flex flex-wrap gap-2">
            <CsvImportButton
              entityName="carriers"
              fields={importFields}
              createRow={(payload) => dispatch(createCarrier(payload as CarrierPayload)).unwrap()}
              onComplete={() => void load()}
            />
            <Button size="action" onClick={() => openForm(null)}>
              <PlusIcon className="size-5" /> Add Carrier
            </Button>
          </div>
        )}
      </div>

      <FilterToolbar
        searchPlaceholder="Search carriers..."
        searchValue={search}
        onSearchChange={setSearch}
        filters={
          canUpdate
            ? [
                {
                  component: (
                    <DeletedToggle pressed={showDeleted} onPressedChange={(v) => {
                          setShowDeleted(v)
                          setPage(1)
                        }} />
                  ),
                },
              ]
            : []
        }
      />

      <DataTable
        columns={columns}
        data={carriers}
        isLoading={isFetchingList}
        error={error}
        onRetry={() => {
          load()
        }}
        manualPagination
        pageSize={PAGE_SIZE}
        pageIndex={page - 1}
        pageCount={meta?.totalPages ?? 1}
        totalCount={totalItems}
        onPageChange={(index) => setPage(index + 1)}
        emptyTitle="No carriers yet"
        emptyDescription="Add a courier partner to start shipping orders."
        minWidth="800px"
        columnWidths={canUpdate ? ["220px", "220px", "160px", "120px", "110px"] : ["240px", "240px", "180px", "140px"]}
      />

      <CarrierFormDialog open={formOpen} onOpenChange={setFormOpen} carrier={editing} onSaved={() => load()} />
    </div>
  )
}

export default Carriers
