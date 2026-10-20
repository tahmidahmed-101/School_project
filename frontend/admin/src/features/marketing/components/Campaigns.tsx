import { useEffect, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Link, useNavigate } from "react-router-dom"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Combobox } from "@/components/common/ComboBox"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { DateCell } from "@/components/common/cells"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchCampaignAudience } from "@/features/marketing/api"
import { fetchAll } from "@/features/marketing/slices/campaignSlice"
import type { CampaignAudience, EmailCampaign } from "@/features/marketing/types"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import type { Option } from "@/lib/types"
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUS_TONE } from "../lib/campaigns"

const statusOptions: Option[] = Object.entries(CAMPAIGN_STATUS_LABEL).map(([value, label]) => ({ label, value }))

/** The date that matters for where the campaign is in its life. */
function campaignWhen(campaign: EmailCampaign): { label: string; value: string | null } {
  switch (campaign.status) {
    case "scheduled":
      return { label: "Sends", value: campaign.scheduled_at }
    case "sending":
      return { label: "Started", value: campaign.started_at }
    case "sent":
      return { label: "Finished", value: campaign.finished_at }
    case "cancelled":
      return { label: "Cancelled", value: campaign.cancelled_at }
    default:
      return { label: "Created", value: campaign.created_at }
  }
}

function AudienceStat({ label, value, sub }: { label: string; value: number | null; sub: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{value ?? "—"}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  )
}

const Campaigns = () => {
  useDocumentTitle("Email campaigns")

  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const canManage = useCan("marketing.manage")
  const campaignState = useAppSelector((state) => state.campaigns)

  const [statusFilter, setStatusFilter] = useState<Option | null>(null)
  const [audience, setAudience] = useState<CampaignAudience | null>(null)

  const list = useListPage({
    fetch: (params) => dispatch(fetchAll(params)),
    state: campaignState,
    params: { status: statusFilter?.value },
  })

  useEffect(() => {
    const controller = new AbortController()
    fetchCampaignAudience(controller.signal).then(setAudience, () => {
      // The summary is supplementary; the list still works without it.
    })
    return () => controller.abort()
  }, [])

  const columns: ColumnDef<EmailCampaign>[] = [
    {
      accessorKey: "name",
      header: "CAMPAIGN",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.original.name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.subject}</p>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "STATUS",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          tone={CAMPAIGN_STATUS_TONE[row.original.status]}
          label={CAMPAIGN_STATUS_LABEL[row.original.status]}
        />
      ),
    },
    {
      id: "recipients",
      header: "ACCEPTED",
      meta: { align: "right" },
      cell: ({ row: { original: campaign } }) =>
        campaign.recipient_count ? (
          <span className="tabular-nums">
            {campaign.delivery_counts.sent} / {campaign.recipient_count}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "when",
      header: "WHEN",
      cell: ({ row }) => {
        const { label, value } = campaignWhen(row.original)
        return (
          <div className="text-sm">
            <span className="text-muted-foreground">{label} </span>
            <DateCell withTime value={value} />
          </div>
        )
      },
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Email campaigns"
        description="Plain-text newsletters to your subscribers. Each email carries its own unsubscribe link."
        actions={
          canManage && (
            <Button variant="apply" size="action" onClick={() => navigate("/campaign_form/new")}>
              <PlusIcon className="size-5" /> New Campaign
            </Button>
          )
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <AudienceStat
          label="Will receive"
          value={audience?.eligible_recipients ?? null}
          sub="Subscribers the next campaign would reach"
        />
        <AudienceStat
          label="Subscribed"
          value={audience?.active_subscribers ?? null}
          sub={
            <Link to="/subscribers" className="text-primary hover:underline">
              View subscribers
            </Link>
          }
        />
        <AudienceStat
          label="Blocked"
          value={audience?.suppressed_addresses ?? null}
          sub={
            <Link to="/email_blocklist" className="text-primary hover:underline">
              View blocked emails
            </Link>
          }
        />
      </div>

      <FilterToolbar
        searchPlaceholder="Search by name or subject..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[
          {
            component: (
              <Combobox options={statusOptions} placeholder="Status" value={statusFilter} onValueChange={setStatusFilter} />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={campaignState.data}
        {...list.tableProps}
        getRowLink={(c) => `/campaign_detail/${c.id}`}
        emptyTitle="No campaigns"
        emptyDescription="Write a newsletter, send yourself a test, then schedule it."
        emptyActionLabel={canManage ? "New Campaign" : undefined}
        onEmptyAction={canManage ? () => navigate("/campaign_form/new") : undefined}
        minWidth="760px"
      />
    </div>
  )
}

export default Campaigns
