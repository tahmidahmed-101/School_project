import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Ban, CalendarClock, Pencil, RotateCcw, Send, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { DeleteModal } from "@/components/common/DeleteModal"
import { DetailPageState } from "@/components/common/DetailPageState"
import { DetailRow } from "@/components/common/DetailRow"
import { FormDialog } from "@/components/common/FormDialog"
import { PageHeader } from "@/components/common/PageHeader"
import { StatusBadge } from "@/components/common/StatusBadge"
import { DateField, TextField } from "@/components/common/form-fields"

import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { resolveDetailState } from "@/lib/detailState"
import { formatDateTime, fromDatetimeLocal } from "@/lib/format"

import { sendCampaignTest } from "../api"
import {
  CAMPAIGN_CHANNEL_LABEL,
  CAMPAIGN_STATUS_LABEL,
  CAMPAIGN_STATUS_TONE,
  copiesLeft,
  deliveryReason,
} from "../lib/campaigns"
import {
  cancelCampaign,
  deleteData,
  fetchSingle,
  scheduleCampaign,
  unscheduleCampaign,
} from "../slices/campaignSlice"
import type { EmailCampaign } from "../types"
import { CampaignDeliveries } from "./CampaignDeliveries"

// While a campaign waits or sends, the backend's sender run moves it on; look again this often.
const LIVE_REFRESH_MS = 30_000

function SummaryStat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function TestDialog({
  open,
  onOpenChange,
  campaign,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaign: EmailCampaign
}) {
  const [recipient, setRecipient] = useState("")
  const [sending, setSending] = useState(false)
  const isSms = campaign.channel === "sms"

  const send = async () => {
    setSending(true)
    try {
      const result = await sendCampaignTest(campaign.id, recipient.trim())
      if (result.accepted) {
        toast.success(`Test sent to ${result.recipient}`)
        onOpenChange(false)
      } else {
        toast.error(
          deliveryReason(result.reason) ||
            (isSms ? "The SMS provider did not accept the test text." : "The mail server did not accept the test email.")
        )
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, isSms ? "Couldn't send the test text" : "Couldn't send the test email"))
    } finally {
      setSending(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Send a test"
      description={
        isSms
          ? 'One copy marked "[Test]", so you can check how it reads. Up to 5 tests an hour.'
          : 'One copy marked "[Test]", so you can check how it looks. Up to 5 tests an hour.'
      }
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
      submitting={sending}
      submitLabel="Send Test"
    >
      <TextField
        label="Send to"
        id="campaign-test-recipient"
        type={isSms ? "tel" : "email"}
        placeholder={isSms ? "Your own phone number" : "Your own email"}
        description={isSms ? "Leave empty to send it to your own number." : "Leave empty to send it to yourself."}
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
      />
    </FormDialog>
  )
}

function ScheduleDialog({
  open,
  onOpenChange,
  campaign,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaign: EmailCampaign
}) {
  const dispatch = useAppDispatch()
  const [sendAt, setSendAt] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const schedule = async () => {
    const at = fromDatetimeLocal(sendAt)
    if (at && new Date(at) <= new Date()) {
      setError("Choose a time in the future, or leave it empty to send now")
      return
    }
    setSaving(true)
    try {
      await dispatch(scheduleCampaign({ id: campaign.id, send_at: at })).unwrap()
      toast.success(at ? `${campaign.name} scheduled for ${formatDateTime(at)}` : `${campaign.name} queued to send`)
      onOpenChange(false)
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't schedule this campaign"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setError(null)
      }}
      title={`Schedule ${campaign.name}?`}
      description={
        campaign.channel === "sms"
          ? "It goes to every customer who opted in to SMS at the moment sending starts. You can unschedule it until then."
          : "It goes to every subscriber who can receive it at the moment sending starts. You can unschedule it until then."
      }
      onSubmit={(e) => {
        e.preventDefault()
        schedule()
      }}
      submitting={saving}
      submitLabel={sendAt ? "Schedule" : "Send Now"}
    >
      <DateField
        label="Send at"
        id="campaign-send-at"
        withTime
        description="Leave empty to send with the next sending run (within about 15 minutes)."
        value={sendAt}
        onChange={(e) => {
          setSendAt(e.target.value)
          setError(null)
        }}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </FormDialog>
  )
}

const CampaignDetail = () => {
  const { id = "" } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = useCan("marketing.manage")
  const { singleData, singleStatus, singleError } = useAppSelector((state) => state.campaigns)
  const campaign = singleData?.id === id ? (singleData as EmailCampaign) : null

  const [testOpen, setTestOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useDocumentTitle(campaign ? `${campaign.name} — Campaign` : "Campaign")

  const load = useCallback(() => dispatch(fetchSingle(id)), [dispatch, id])
  useEffect(() => {
    const request = load()
    return () => request.abort()
  }, [load])

  const live = campaign?.status === "scheduled" || campaign?.status === "sending"
  useEffect(() => {
    if (!live) return
    const timer = window.setInterval(() => {
      load()
      setRefreshKey((k) => k + 1)
    }, LIVE_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [live, load])

  const state = resolveDetailState(singleStatus, singleError, !!campaign)
  if (state || !campaign) {
    return (
      <DetailPageState
        state={state ?? "loading"}
        entity="Campaign"
        backTo="/campaigns"
        backLabel="Back to campaigns"
        error={singleError}
        onRetry={load}
      />
    )
  }

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    try {
      await action()
      toast.success(success)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Action failed"))
    } finally {
      setBusy(false)
    }
  }

  const { status, delivery_counts: counts } = campaign
  const isSms = campaign.channel === "sms"
  const isDraft = status === "draft"
  const started = campaign.recipient_count > 0

  return (
    <div className="section-container space-y-6">
      <PageHeader
        back={{ to: "/campaigns", label: "Back to campaigns" }}
        title={campaign.name}
        badges={
          <>
            <StatusBadge status={status} tone={CAMPAIGN_STATUS_TONE[status]} label={CAMPAIGN_STATUS_LABEL[status]} />
            <StatusBadge status={campaign.channel} tone="secondary" label={CAMPAIGN_CHANNEL_LABEL[campaign.channel]} />
          </>
        }
        description={isSms ? undefined : campaign.subject}
        actions={
          canManage && (
            <>
              {isDraft && (
                <Button variant="primary" size="action" onClick={() => navigate(`/campaign_form/${campaign.id}`)}>
                  <Pencil className="size-4" /> Edit
                </Button>
              )}
              {status !== "cancelled" && status !== "sent" && (
                <Button variant="primary" size="action" onClick={() => setTestOpen(true)}>
                  <Send className="size-4" /> Send Test
                </Button>
              )}
              {isDraft && (
                <Button size="action" onClick={() => setScheduleOpen(true)} disabled={busy}>
                  <CalendarClock className="size-4" /> Schedule
                </Button>
              )}
              {status === "scheduled" && (
                <ConfirmDialog
                  title={`Unschedule ${campaign.name}?`}
                  description="It goes back to being a draft, so you can edit it and schedule it again."
                  confirmLabel="Unschedule"
                  onConfirm={() =>
                    runAction(() => dispatch(unscheduleCampaign(campaign.id)).unwrap(), "Campaign moved back to draft")
                  }
                  trigger={
                    <Button variant="primary" size="action" disabled={busy}>
                      <RotateCcw className="size-4" /> Unschedule
                    </Button>
                  }
                />
              )}
              {(status === "scheduled" || status === "sending") && (
                <ConfirmDialog
                  title={`Cancel ${campaign.name}?`}
                  description={
                    status === "sending"
                      ? `Copies not sent yet are skipped. ${isSms ? "Texts already handed to the SMS provider" : "Emails already handed to the mail server"} can't be recalled. This can't be undone.`
                      : "It won't be sent. This can't be undone; to send it later, unschedule it instead."
                  }
                  confirmLabel="Cancel campaign"
                  destructive
                  onConfirm={() => runAction(() => dispatch(cancelCampaign(campaign.id)).unwrap(), "Campaign cancelled")}
                  trigger={
                    <Button variant="destructive" size="action" disabled={busy}>
                      <Ban className="size-4" /> Cancel
                    </Button>
                  }
                />
              )}
              {isDraft && (
                <DeleteModal
                  title={`Delete ${campaign.name}?`}
                  description="The draft is removed for good."
                  onConfirm={() =>
                    runAction(async () => {
                      await dispatch(deleteData(campaign.id)).unwrap()
                      navigate("/campaigns")
                    }, `${campaign.name} deleted`)
                  }
                  trigger={
                    <Button variant="destructive" size="action" disabled={busy}>
                      <Trash2 className="size-4" /> Delete
                    </Button>
                  }
                />
              )}
            </>
          )
        }
      />

      {started ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryStat label="Recipients" value={campaign.recipient_count} />
          <SummaryStat label="Accepted" value={counts.sent} sub={isSms ? "Taken by the SMS provider" : "Taken by the mail server"} />
          <SummaryStat label="Still to send" value={copiesLeft(campaign)} />
          <SummaryStat
            label="Not sent"
            value={counts.failed + counts.skipped}
            sub={`${counts.failed} failed · ${counts.skipped} skipped`}
          />
        </div>
      ) : (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            {status === "scheduled"
              ? campaign.scheduled_at && new Date(campaign.scheduled_at) > new Date()
                ? `Sending starts ${formatDateTime(campaign.scheduled_at)}. The recipients are fixed then.`
                : "Sending starts with the next sending run. The recipients are fixed then."
              : status === "cancelled"
                ? "This campaign was cancelled before it started sending."
                : "Not sent yet. Send yourself a test, then schedule it."}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Message</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isSms && <DetailRow label="Subject">{campaign.subject}</DetailRow>}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm whitespace-pre-wrap break-words">{campaign.body}</p>
              <p className="mt-4 border-t border-dashed border-border pt-3 text-xs text-muted-foreground">
                {isSms
                  ? "Each text ends with the customer's own opt-out link."
                  : "Each email ends with your business name and address and the recipient's own unsubscribe link."}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <DetailRow label="Created">{formatDateTime(campaign.created_at)}</DetailRow>
            {campaign.scheduled_at && <DetailRow label="Scheduled for">{formatDateTime(campaign.scheduled_at)}</DetailRow>}
            {campaign.started_at && <DetailRow label="Started">{formatDateTime(campaign.started_at)}</DetailRow>}
            {campaign.finished_at && <DetailRow label="Finished">{formatDateTime(campaign.finished_at)}</DetailRow>}
            {campaign.cancelled_at && <DetailRow label="Cancelled">{formatDateTime(campaign.cancelled_at)}</DetailRow>}
          </CardContent>
        </Card>
      </div>

      {started && <CampaignDeliveries campaignId={campaign.id} refreshKey={refreshKey} />}

      <TestDialog open={testOpen} onOpenChange={setTestOpen} campaign={campaign} />
      <ScheduleDialog open={scheduleOpen} onOpenChange={setScheduleOpen} campaign={campaign} />
    </div>
  )
}

export default CampaignDetail
