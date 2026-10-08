import type { ColumnDef } from "@tanstack/react-table"
import { useNavigate } from "react-router-dom"

import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { TableActions } from "@/components/common/TableActions"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchAllShipments } from "@/features/shipping/slices/shipmentSlice"
import type { Shipment } from "@/features/shipping/types"
import { StatusBadge } from "@/components/common/StatusBadge"
import { DateCell, LinkCell, MoneyCell } from "@/components/common/cells"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import { ReturnOutcome } from "./ReturnOutcome"
import { ShipmentActions } from "./ShipmentActions"

const Shipments = () => {
  useDocumentTitle("Shipments")

  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const shipmentState = useAppSelector((state) => state.shipments)
  const list = useListPage({ fetch: (p) => dispatch(fetchAllShipments(p)), state: shipmentState })

  const columns: ColumnDef<Shipment>[] = [
    {
      accessorKey: "tracking_number",
      header: "TRACKING #",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium text-primary">{row.original.tracking_number || "—"}</span>
      ),
    },
    {
      accessorKey: "carrier_name",
      header: "CARRIER",
      cell: ({ row }) => <span className="text-sm">{row.original.carrier_name || "Not set"}</span>,
    },
    {
      id: "order",
      header: "ORDER",
      cell: ({ row }) => (
        <LinkCell to={`/order_detail/${row.original.order_id}`}>View order</LinkCell>
      ),
    },
    {
      accessorKey: "cod_amount",
      header: "COD",
      cell: ({ row }) => <MoneyCell value={row.original.cod_amount} />,
    },
    {
      accessorKey: "status",
      header: "STATUS",
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={row.original.status} />
          <ReturnOutcome shipment={row.original} />
          {row.original.courier_status && (
            <span className="text-xs text-muted-foreground">{row.original.courier_status}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "shipped_at",
      header: "SHIPPED",
      cell: ({ row }) => <DateCell value={row.original.shipped_at} withTime className="text-muted-foreground" />,
    },
    {
      id: "update",
      header: "UPDATE",
      cell: ({ row }) => <ShipmentActions shipment={row.original} />,
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => (
        <TableActions
          itemName={`Shipment ${row.original.tracking_number || ""}`.trim()}
          viewUrl={`/shipment_detail/${row.original.id}`}
        />
      ),
    },
  ]

  return (
    <div className="section-container">
      <PageHeader title="Shipments" />

      <FilterToolbar
        searchPlaceholder="Search tracking #, order # or carrier..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
      />

      <DataTable
        columns={columns}
        data={shipmentState.data}
        {...list.tableProps}
        onRowClick={(s) => navigate(`/shipment_detail/${s.id}`)}
        emptyTitle="No shipments found"
        emptyDescription="Shipments are created from a confirmed order's detail page."
        minWidth="1150px"
        columnWidths={["170px", "150px", "110px", "120px", "150px", "170px", "220px", "80px"]}
      />
    </div>
  )
}

export default Shipments
