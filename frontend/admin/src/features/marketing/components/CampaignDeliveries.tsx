import { useEffect, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Combobox } from "@/components/common/ComboBox"
import { DataTable } from "@/components/common/data-table"
import { DateCell } from "@/components/common/cells"
import { StatusBadge } from "@/components/common/StatusBadge"
import type { ApiError } from "@/lib/api/client"
import type { Option } from "@/lib/types"
import { fetchCampaignDeliveries } from "../api"
import { DELIVERY_STATUS_LABEL, DELIVERY_STATUS_TONE, deliveryReason } from "../lib/campaigns"
import type { CampaignDelivery, DeliveryStatus } from "../types"

const PAGE_SIZE = 20

const statusOptions: Option[] = Object.entries(DELIVERY_STATUS_LABEL).map(([value, label]) => ({ label, value }))

const columns: ColumnDef<CampaignDelivery>[] = [
  {
    accessorKey: "email",
    header: "RECIPIENT",
    cell: ({ row }) => <span className="text-sm font-medium">{row.original.email}</span>,
  },
  {
    accessorKey: "status",
    header: "STATUS",
    cell: ({ row: { original: delivery } }) => (
      <div className="space-y-0.5">
        <StatusBadge
          status={delivery.status}
          tone={DELIVERY_STATUS_TONE[delivery.status]}
          label={DELIVERY_STATUS_LABEL[delivery.status]}
        />
        {delivery.failure_reason && (
          <p className="max-w-xs text-xs text-muted-foreground">{deliveryReason(delivery.failure_reason)}</p>
        )}
      </div>
    ),
  },
  {
    accessorKey: "attempts",
    header: "TRIES",
    meta: { align: "right" },
    cell: ({ row }) => <span className="tabular-nums">{row.original.attempts}</span>,
  },
  {
    accessorKey: "sent_at",
    header: "ACCEPTED AT",
    cell: ({ row }) => <DateCell withTime value={row.original.sent_at} className="text-muted-foreground" />,
  },
]

/** Each recipient's copy of a campaign. `refreshKey` reloads the current page. */
export function CampaignDeliveries({ campaignId, refreshKey }: { campaignId: string; refreshKey: number }) {
  const [status, setStatus] = useState<Option | null>(null)
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<CampaignDelivery[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchCampaignDeliveries(
      campaignId,
      { page, page_size: PAGE_SIZE, status: status?.value as DeliveryStatus | undefined },
      controller.signal
    ).then(
      ({ items, meta }) => {
        setRows(items)
        setTotal(meta.count)
        setError(null)
        setLoading(false)
      },
      (err: ApiError) => {
        if (controller.signal.aborted) return
        setError(err)
        setLoading(false)
      }
    )
    return () => controller.abort()
  }, [campaignId, page, status, refreshKey, retryKey])

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Recipients</CardTitle>
        <div className="w-48">
          <Combobox
            options={statusOptions}
            placeholder="All statuses"
            value={status}
            onValueChange={(next) => {
              setStatus(next)
              setPage(1)
              setLoading(true)
            }}
          />
        </div>
      </CardHeader>
      <CardContent>
        <DataTable
          embedded
          columns={columns}
          data={rows}
          manualPagination
          pageSize={PAGE_SIZE}
          pageIndex={page - 1}
          pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          totalCount={total}
          onPageChange={(index) => {
            setPage(index + 1)
            setLoading(true)
          }}
          isLoading={loading}
          error={error}
          onRetry={() => {
            setLoading(true)
            setRetryKey((k) => k + 1)
          }}
          emptyTitle={status ? "No recipients with this status" : "No recipients"}
          emptyDescription="The recipient list is fixed when the campaign starts sending."
          minWidth="640px"
        />
      </CardContent>
    </Card>
  )
}
