import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable } from "@/components/common/data-table"
import { PageHeading } from "@/components/common/PageHeading"
import { TableActions } from "@/components/common/TableActions"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { deleteRate, fetchRates } from "@/features/shipping/slices/rateSlice"
import { createZoneRate, fetchZoneOptions } from "@/features/shipping/slices/zoneSlice"
import { fetchCarrierOptions } from "@/features/shipping/slices/carrierSlice"
import type { Carrier, ShippingRate, ShippingRatePayload, ShippingZone } from "@/features/shipping/types"
import { useCan } from "@/features/sales/shared/useCan"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency } from "@/lib/format"
import { RateFormDialog } from "./RateFormDialog"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { createImportLookup, fetchAllPages } from "@/features/catalog/lib/importLookup"

const PAGE_SIZE = 20
const ALL = "__all__"

const ShippingRates = () => {
  useDocumentTitle("Shipping Rates")

  const dispatch = useAppDispatch()
  const canUpdate = useCan("shipments.update")
  const { data: rates, isFetchingList, error, totalItems, meta } = useAppSelector((state) => state.shippingRates)

  // ?zone_id=… comes from the zones page's "N rate(s)" link.
  const [searchParams, setSearchParams] = useSearchParams()
  const zoneId = searchParams.get("zone_id") ?? ""
  const carrierId = searchParams.get("carrier_id") ?? ""

  const [page, setPage] = useState(1)
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

  // CSV import: zone and carrier are given by name (carrier also by provider code, e.g. "pathao").
  const importLookups = useMemo(
    () => ({
      zone: createImportLookup<ShippingZone>(
        "Zone",
        () => fetchAllPages<ShippingZone>("/admin/logistics/zones/"),
        (z) => [z.name]
      ),
      carrier: createImportLookup<Carrier>(
        "Carrier",
        () => fetchAllPages<Carrier>("/admin/logistics/carriers/"),
        (c) => [c.name, c.code]
      ),
    }),
    []
  )
  const importFields = useMemo<ImportField[]>(
    () => [
      { key: "zone_id", label: "Zone", required: true, aliases: ["zone name", "delivery zone"], example: "Inside Dhaka", resolve: importLookups.zone.resolve },
      { key: "carrier_id", label: "Carrier", required: true, aliases: ["carrier name", "courier"], example: "Pathao Courier", resolve: importLookups.carrier.resolve },
      { key: "base_weight", label: "Base weight (kg)", required: true, type: "number", aliases: ["base weight"], example: "1" },
      { key: "base_charge", label: "Base charge (BDT)", required: true, type: "number", aliases: ["base charge"], example: "60" },
      { key: "increment_weight", label: "Extra weight step (kg)", required: true, type: "number", aliases: ["increment weight"], example: "0.5" },
      { key: "increment_charge", label: "Extra charge per step (BDT)", required: true, type: "number", aliases: ["increment charge"], example: "15" },
    ],
    [importLookups]
  )
  const importRate = (payload: Record<string, unknown>) => {
    const { zone_id, ...rate } = payload
    return dispatch(
      createZoneRate({ zoneId: String(zone_id), payload: rate as unknown as ShippingRatePayload & { carrier_id: string } })
    ).unwrap()
  }

  const zoneNames = useMemo(() => new Map(zones.map((z) => [z.id, z.name])), [zones])
  const carrierNames = useMemo(() => new Map(carriers.map((c) => [c.id, c.name])), [carriers])

  const load = useCallback(
    () =>
      dispatch(
        fetchRates({
          page,
          page_size: PAGE_SIZE,
          ...(zoneId ? { zone_id: zoneId } : {}),
          ...(carrierId ? { carrier_id: carrierId } : {}),
        })
      ),
    [dispatch, page, zoneId, carrierId]
  )

  useEffect(() => {
    const request = load()
    return () => request.abort()
  }, [load])

  const setFilter = (key: "zone_id" | "carrier_id", value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value === ALL) next.delete(key)
    else next.set(key, value)
    setSearchParams(next, { replace: true })
    setPage(1)
  }

  const openForm = (rate: ShippingRate | null) => {
    setEditing(rate)
    setFormOpen(true)
  }

  const handleDelete = async (rate: ShippingRate) => {
    try {
      await dispatch(deleteRate(rate.id)).unwrap()
      toast.success("Rate deleted")
      load()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete rate"))
    }
  }

  const columns: ColumnDef<ShippingRate>[] = [
    {
      id: "zone",
      header: "ZONE",
      cell: ({ row }) => <span className="text-sm font-medium">{zoneNames.get(row.original.zone_id) ?? "—"}</span>,
    },
    {
      id: "carrier",
      header: "CARRIER",
      cell: ({ row }) => <span className="text-sm">{carrierNames.get(row.original.carrier_id) ?? "—"}</span>,
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
            header: "ACTION",
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
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Shipping Rates" description="What each carrier charges per delivery zone, by weight." />
        {canUpdate && (
          <div className="flex flex-wrap gap-2">
            <CsvImportButton
              entityName="shipping rates"
              fields={importFields}
              createRow={importRate}
              onComplete={() => {
                importLookups.zone.reset()
                importLookups.carrier.reset()
                void load()
              }}
            />
            <Button size="action" onClick={() => openForm(null)} disabled={zones.length === 0 || carriers.length === 0}>
              <PlusIcon className="size-5" /> Add Rate
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 pt-4">
        <Select value={zoneId || ALL} onValueChange={(v) => setFilter("zone_id", v)}>
          <SelectTrigger className="h-9 w-[200px]" aria-label="Filter by zone">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All zones</SelectItem>
            {zones.map((z) => (
              <SelectItem key={z.id} value={z.id}>
                {z.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={carrierId || ALL} onValueChange={(v) => setFilter("carrier_id", v)}>
          <SelectTrigger className="h-9 w-[200px]" aria-label="Filter by carrier">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All carriers</SelectItem>
            {carriers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={rates}
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
        emptyTitle="No rates"
        emptyDescription="Add a carrier rate to a delivery zone."
        minWidth="800px"
        columnWidths={canUpdate ? ["200px", "200px", "200px", "200px", "100px"] : ["220px", "220px", "220px", "220px"]}
      />

      <RateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        rate={editing}
        zones={zones}
        carriers={carriers}
        defaultZoneId={zoneId || undefined}
        onSaved={() => load()}
      />
    </div>
  )
}

export default ShippingRates
