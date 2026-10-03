import { useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { Combobox } from "@/components/common/ComboBox"
import { PageHeader } from "@/components/common/PageHeader"
import { TableActions } from "@/components/common/TableActions"
import { TextCell } from "@/components/common/cells"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { deleteRate, fetchRates } from "@/features/shipping/slices/rateSlice"
import { fetchZoneOptions } from "@/features/shipping/slices/zoneSlice"
import { fetchCarrierOptions } from "@/features/shipping/slices/carrierSlice"
import type { Carrier, ShippingRate, ShippingZone } from "@/features/shipping/types"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency } from "@/lib/format"
import type { Option } from "@/lib/types"
import { RateFormDialog } from "./RateFormDialog"

const ShippingRates = () => {
  useDocumentTitle("Shipping Rates")

  const dispatch = useAppDispatch()
  const canUpdate = useCan("shipments.update")
  const rateState = useAppSelector((state) => state.shippingRates)

  // ?zone_id=… comes from the zones page's "N rate(s)" link.
  const [searchParams, setSearchParams] = useSearchParams()
  const zoneId = searchParams.get("zone_id") ?? ""
  const carrierId = searchParams.get("carrier_id") ?? ""

  const [zones, setZones] = useState<ShippingZone[]>([])
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [editing, setEditing] = useState<ShippingRate | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => {
    const zoneReq = dispatch(fetchZoneOptions())
    const carrierReq = dispatch(fetchCarrierOptions())
    zoneReq.unwrap().then(setZones).catch(() => setZones([]))
    carrierReq.unwrap().then(setCarriers).catch(() => setCarriers([]))
    return () => {
      zoneReq.abort()
      carrierReq.abort()
    }
  }, [dispatch])

  const zoneNames = useMemo(() => new Map(zones.map((z) => [z.id, z.name])), [zones])
  const carrierNames = useMemo(() => new Map(carriers.map((c) => [c.id, c.name])), [carriers])
  const zoneOptions = useMemo<Option[]>(() => zones.map((z) => ({ label: z.name, value: z.id })), [zones])
  const carrierOptions = useMemo<Option[]>(() => carriers.map((c) => ({ label: c.name, value: c.id })), [carriers])

  const list = useListPage({
    fetch: (p) => dispatch(fetchRates(p)),
    state: rateState,
    params: { zone_id: zoneId, carrier_id: carrierId },
  })

  const setFilter = (key: "zone_id" | "carrier_id", option: Option | null) => {
    const next = new URLSearchParams(searchParams)
    if (option) next.set(key, option.value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const openForm = (rate: ShippingRate | null) => {
    setEditing(rate)
    setFormOpen(true)
  }

  const handleDelete = async (rate: ShippingRate) => {
    try {
      await dispatch(deleteRate(rate.id)).unwrap()
      toast.success("Rate deleted")
      list.reload()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete rate"))
    }
  }

  const columns: ColumnDef<ShippingRate>[] = [
    {
      id: "zone",
      header: "ZONE",
      cell: ({ row }) => <TextCell value={zoneNames.get(row.original.zone_id)} className="font-medium" />,
    },
    {
      id: "carrier",
      header: "CARRIER",
      cell: ({ row }) => <TextCell value={carrierNames.get(row.original.carrier_id)} />,
    },
    {
      id: "base",
      header: "BASE",
      cell: ({ row }) => (
        <span className="text-sm">
          {formatCurrency(row.original.base_charge)}{" "}
          <span className="text-muted-foreground">up to {Number(row.original.base_weight)} kg</span>
        </span>
      ),
    },
    {
      id: "increment",
      header: "EACH EXTRA",
      cell: ({ row }) => (
        <span className="text-sm">
          {formatCurrency(row.original.increment_charge)}{" "}
          <span className="text-muted-foreground">per {Number(row.original.increment_weight)} kg</span>
        </span>
      ),
    },
    ...(canUpdate
      ? [
          {
            id: "actions",
            header: "ACTIONS",
            cell: ({ row }) => (
              <TableActions
                itemName="this rate"
                onEdit={() => openForm(row.original)}
                onDelete={() => handleDelete(row.original)}
              />
            ),
          } satisfies ColumnDef<ShippingRate>,
        ]
      : []),
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Shipping Rates"
        actions={
          canUpdate && (
            <Button size="action" onClick={() => openForm(null)} disabled={zones.length === 0 || carriers.length === 0}>
              <PlusIcon className="size-5" /> Add Rate
            </Button>
          )
        }
      />

      <FilterToolbar
        filters={[
          {
            active: Boolean(zoneId),
            component: (
              <Combobox
                placeholder="Zone"
                options={zoneOptions}
                value={zoneOptions.find((o) => o.value === zoneId) ?? null}
                onValueChange={(v) => setFilter("zone_id", v)}
              />
            ),
          },
          {
            active: Boolean(carrierId),
            component: (
              <Combobox
                placeholder="Carrier"
                options={carrierOptions}
                value={carrierOptions.find((o) => o.value === carrierId) ?? null}
                onValueChange={(v) => setFilter("carrier_id", v)}
              />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        bulk={
          canUpdate
            ? { noun: "rate", deleteRow: (r) => dispatch(deleteRate(r.id)).unwrap(), onDone: list.reload }
            : undefined
        }
        data={rateState.data}
        {...list.tableProps}
        emptyTitle="No rates"
        emptyDescription="Add a carrier rate to a delivery zone."
        minWidth="800px"
        columnWidths={canUpdate ? ["200px", "200px", "200px", "200px", "80px"] : ["220px", "220px", "220px", "220px"]}
      />

      <RateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        rate={editing}
        zones={zones}
        carriers={carriers}
        defaultZoneId={zoneId || undefined}
        onSaved={list.reload}
      />
    </div>
  )
}

export default ShippingRates
