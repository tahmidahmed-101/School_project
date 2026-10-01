import { useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useNavigate } from "react-router-dom"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { TextCell } from "@/components/common/cells"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { deleteZone, fetchZones, restoreZone } from "@/features/shipping/slices/zoneSlice"
import type { ShippingZone } from "@/features/shipping/types"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { ZoneFormDialog } from "./ZoneFormDialog"
import { useSoftDeleteList } from "./useSoftDeleteList"

const MAX_AREAS_SHOWN = 6

const ShippingZones = () => {
  useDocumentTitle("Delivery Zones")

  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canUpdate = useCan("shipments.update")
  const zoneState = useAppSelector((state) => state.shippingZones)
  const [editing, setEditing] = useState<ShippingZone | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const openForm = (zone: ShippingZone | null) => {
    setEditing(zone)
    setFormOpen(true)
  }

  const { list, trailingColumns, filters } = useSoftDeleteList<ShippingZone>({
    fetch: (p) => dispatch(fetchZones(p)),
    state: zoneState,
    noun: "zone",
    canUpdate,
    remove: (id) => dispatch(deleteZone(id)).unwrap(),
    restore: (id) => dispatch(restoreZone(id)).unwrap(),
    onEdit: openForm,
  })

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
        if (areas.length === 0) return <TextCell value={null} />
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
    ...trailingColumns,
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Delivery Zones"
        description="Areas that share delivery pricing."
        actions={
          canUpdate && (
            <Button size="action" onClick={() => openForm(null)}>
              <PlusIcon className="size-5" /> New Zone
            </Button>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search zones..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={filters}
      />

      <DataTable
        columns={columns}
        data={zoneState.data}
        {...list.tableProps}
        emptyTitle="No delivery zones"
        emptyDescription="Create a zone, then add carrier rates to it."
        minWidth="850px"
        columnWidths={canUpdate ? ["180px", "380px", "100px", "110px", "110px"] : ["200px", "420px", "110px", "120px"]}
      />

      <ZoneFormDialog open={formOpen} onOpenChange={setFormOpen} zone={editing} onSaved={list.reload} />
    </div>
  )
}

export default ShippingZones
