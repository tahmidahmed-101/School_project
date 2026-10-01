import { useCallback, useEffect, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { PlusIcon, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeading } from "@/components/common/PageHeading"
import { StatusBadge } from "@/components/common/StatusBadge"
import { TableActions } from "@/components/common/TableActions"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { createZone, deleteZone, fetchZones, restoreZone } from "@/features/shipping/slices/zoneSlice"
import type { ShippingZone, ShippingZonePayload } from "@/features/shipping/types"
import { useCan } from "@/features/sales/shared/useCan"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { ZoneFormDialog } from "./ZoneFormDialog"
import { DeletedToggle } from "@/components/common/DeletedToggle"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { splitList } from "@/features/catalog/lib/importLookup"

const PAGE_SIZE = 20
const MAX_AREAS_SHOWN = 6

const importFields: ImportField[] = [
  { key: "name", label: "Name", required: true, aliases: ["zone", "zone name"], example: "Chattogram City" },
  {
    key: "country_codes",
    label: "Areas",
    aliases: ["area", "areas covered", "country codes", "districts"],
    example: "chattogram; agrabad; halishahar; pahartali",
    // Address keywords, separated by ";", "|" or ",". Leave empty for a catch-all zone.
    resolve: (raw: string) => splitList(raw, true),
  },
]

const ShippingZones = () => {
  useDocumentTitle("Delivery Zones")

  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canUpdate = useCan("shipments.update")
  const { data: zones, isFetchingList, error, totalItems, meta } = useAppSelector((state) => state.shippingZones)

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [showDeleted, setShowDeleted] = useState(false)
  const [editing, setEditing] = useState<ShippingZone | null>(null)
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
        fetchZones({
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

  const openForm = (zone: ShippingZone | null) => {
    setEditing(zone)
    setFormOpen(true)
  }

  const handleDelete = async (zone: ShippingZone) => {
    try {
      await dispatch(deleteZone(zone.id)).unwrap()
      toast.success(`${zone.name} deleted`)
      load()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete zone"))
    }
  }

  const handleRestore = async (zone: ShippingZone) => {
    try {
      await dispatch(restoreZone(zone.id)).unwrap()
      toast.success(`${zone.name} restored`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to restore zone"))
    }
  }

  const columns: ColumnDef<ShippingZone>[] = [
    {
      accessorKey: "name",
      header: "ZONE",
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.name}</span>,
    },
    {
      id: "areas",
      header: "AREAS",
      cell: ({ row }) => {
        const areas = row.original.country_codes
        if (areas.length === 0) return <span className="text-sm text-muted-foreground">—</span>
        return (
          <div className="flex flex-wrap gap-1">
            {areas.slice(0, MAX_AREAS_SHOWN).map((a) => (
              <Badge key={a} variant="secondary" className="capitalize">
                {a}
              </Badge>
            ))}
            {areas.length > MAX_AREAS_SHOWN && (
              <span className="text-xs text-muted-foreground">+{areas.length - MAX_AREAS_SHOWN} more</span>
            )}
          </div>
        )
      },
    },
    {
      id: "rates",
      header: "RATES",
      cell: ({ row }) => (
        <Button
          variant="link"
          size="sm"
          className="px-0"
          data-no-row-click="true"
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/shipping_rates?zone_id=${row.original.id}`)
          }}
        >
          {row.original.rates.length} rate(s)
        </Button>
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
          } satisfies ColumnDef<ShippingZone>,
        ]
      : []),
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Delivery Zones" description="Areas that share delivery pricing." />
        {canUpdate && (
          <div className="flex flex-wrap gap-2">
            <CsvImportButton
              entityName="delivery zones"
              fields={importFields}
              createRow={(payload) => dispatch(createZone(payload as ShippingZonePayload)).unwrap()}
              onComplete={() => void load()}
            />
            <Button size="action" onClick={() => openForm(null)}>
              <PlusIcon className="size-5" /> New Zone
            </Button>
          </div>
        )}
      </div>

      <FilterToolbar
        searchPlaceholder="Search zones..."
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
        data={zones}
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
        emptyTitle="No delivery zones"
        emptyDescription="Create a zone, then add carrier rates to it."
        minWidth="850px"
        columnWidths={canUpdate ? ["180px", "380px", "100px", "110px", "110px"] : ["200px", "420px", "110px", "120px"]}
      />

      <ZoneFormDialog open={formOpen} onOpenChange={setFormOpen} zone={editing} onSaved={() => load()} />
    </div>
  )
}

export default ShippingZones
