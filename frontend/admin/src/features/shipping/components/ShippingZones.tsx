import { useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useNavigate } from "react-router-dom"
import { PlusIcon, Truck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { TextCell } from "@/components/common/cells"
import { RestoreDeletedButton } from "@/components/common/RestoreDeletedButton"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { deleteZone, fetchZones, restoreZone, updateZone } from "@/features/shipping/slices/zoneSlice"
import type { ShippingZone } from "@/features/shipping/types"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useSoftDeleteList } from "@/hooks/use-soft-delete-list"
import { ZoneFormDialog } from "./ZoneFormDialog"

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

  const { list, statusColumn, actionsColumn, bulk } = useSoftDeleteList<ShippingZone>({
    fetch: (p) => dispatch(fetchZones(p)),
    state: zoneState,
    noun: "zone",
    canUpdate,
    remove: (id) => dispatch(deleteZone(id)).unwrap(),
    setActive: (id, is_active) => dispatch(updateZone({ id, payload: { is_active } })).unwrap(),
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
          <Truck className="size-4" />
          {row.original.rates.length} rate(s)
        </Button>
      ),
    },
    statusColumn,
    ...(canUpdate ? [actionsColumn] : []),
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Delivery Zones"
        actions={
          canUpdate && (
            <>
              <RestoreDeletedButton<ShippingZone>
                noun="delivery zones"
                endpoint="/admin/logistics/zones/"
                restore={(item) => dispatch(restoreZone(item.id)).unwrap()}
                label={(item) => item.name}
                onRestored={list.reload}
              />
              <Button size="action" onClick={() => openForm(null)}>
                <PlusIcon className="size-5" /> New Zone
              </Button>
            </>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search zones..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
      />

      <DataTable
        columns={columns}
        bulk={bulk}
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
