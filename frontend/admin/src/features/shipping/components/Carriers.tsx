import { useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { StatusBadge } from "@/components/common/StatusBadge"
import { RestoreDeletedButton } from "@/components/common/RestoreDeletedButton"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { deleteCarrier, fetchCarriers, restoreCarrier, updateCarrier } from "@/features/shipping/slices/carrierSlice"
import { CARRIER_PROVIDER_OPTIONS, type Carrier } from "@/features/shipping/types"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useSoftDeleteList } from "@/hooks/use-soft-delete-list"
import { CarrierFormDialog } from "./CarrierFormDialog"

const providerLabel = (code: string) => CARRIER_PROVIDER_OPTIONS.find((o) => o.value === code)?.label ?? code

const Carriers = () => {
  useDocumentTitle("Carriers")

  const dispatch = useAppDispatch()
  const canUpdate = useCan("shipments.update")
  const carrierState = useAppSelector((state) => state.carriers)
  const [editing, setEditing] = useState<Carrier | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const openForm = (carrier: Carrier | null) => {
    setEditing(carrier)
    setFormOpen(true)
  }

  const { list, statusColumn, actionsColumn, bulk } = useSoftDeleteList<Carrier>({
    fetch: (p) => dispatch(fetchCarriers(p)),
    state: carrierState,
    noun: "carrier",
    canUpdate,
    remove: (id) => dispatch(deleteCarrier(id)).unwrap(),
    setActive: (id, is_active) => dispatch(updateCarrier({ id, payload: { is_active } })).unwrap(),
    onEdit: openForm,
  })

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
    statusColumn,
    ...(canUpdate ? [actionsColumn] : []),
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Carriers"
        actions={
          canUpdate && (
            <>
              <RestoreDeletedButton<Carrier>
                noun="carriers"
                endpoint="/admin/logistics/carriers/"
                restore={(item) => dispatch(restoreCarrier(item.id)).unwrap()}
                label={(item) => item.name}
                onRestored={list.reload}
              />
              <Button size="action" onClick={() => openForm(null)}>
                <PlusIcon className="size-5" /> Add Carrier
              </Button>
            </>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search carriers..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
      />

      <DataTable
        columns={columns}
        bulk={bulk}
        data={carrierState.data}
        {...list.tableProps}
        emptyTitle="No carriers yet"
        emptyDescription="Add a courier partner to start shipping orders."
        minWidth="800px"
        columnWidths={canUpdate ? ["220px", "220px", "160px", "120px", "110px"] : ["240px", "240px", "180px", "140px"]}
      />

      <CarrierFormDialog open={formOpen} onOpenChange={setFormOpen} carrier={editing} onSaved={list.reload} />
    </div>
  )
}

export default Carriers
