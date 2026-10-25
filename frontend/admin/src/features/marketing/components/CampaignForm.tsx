import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DetailPageState } from "@/components/common/DetailPageState"
import { PageHeader } from "@/components/common/PageHeader"
import { FormActions } from "@/components/common/FormActions"
import { SelectField, TextField, TextareaField } from "@/components/common/form-fields"

import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchCampaignAudience } from "@/features/marketing/api"
import { CAMPAIGN_CHANNEL_LABEL } from "@/features/marketing/lib/campaigns"
import { smsLength } from "@/features/marketing/lib/smsSegments"
import { fetchSingle, patchData, postData } from "@/features/marketing/slices/campaignSlice"
import type { EmailCampaign, EmailCampaignPayload } from "@/features/marketing/types"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { reportFormError } from "@/lib/forms"
import { resolveDetailState } from "@/lib/detailState"
import type { Option } from "@/lib/types"

const SMS_MAX_BODY = 640
const EMAIL_MAX_BODY = 50_000

// Limits from AdminCampaignWriteSerializer.
const campaignSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(120, "Keep the name to 120 characters"),
    channel: z.enum(["email", "sms"]),
    subject: z.string().trim().max(200, "Keep the subject to 200 characters"),
    body: z.string().refine((value) => value.trim().length > 0, "Write the message"),
  })
  .superRefine((values, ctx) => {
    if (values.channel === "email" && !values.subject) {
      ctx.addIssue({ code: "custom", path: ["subject"], message: "Enter a subject line" })
    }
    const max = values.channel === "sms" ? SMS_MAX_BODY : EMAIL_MAX_BODY
    if (values.body.length > max) {
      ctx.addIssue({
        code: "custom",
        path: ["body"],
        message: `Keep the message to ${max.toLocaleString("en-US")} characters`,
      })
    }
  })

type CampaignFormValues = z.infer<typeof campaignSchema>

const defaultValues: CampaignFormValues = { name: "", channel: "email", subject: "", body: "" }
const FORM_FIELDS = Object.keys(defaultValues)

const channelOptions: Option[] = Object.entries(CAMPAIGN_CHANNEL_LABEL).map(([value, label]) => ({ label, value }))

function SmsCounter({ body, footerLength }: { body: string; footerLength: number | null }) {
  const length = smsLength(body + "x".repeat(footerLength ?? 0))
  return (
    <p className="-mt-2 text-xs text-muted-foreground md:col-span-2" aria-live="polite">
      {length.units} characters · {length.segments} {length.segments === 1 ? "text" : "texts"} per customer ·{" "}
      {length.encoding}
      {footerLength === null ? "" : ` · includes the ${footerLength}-character opt-out footer`}
    </p>
  )
}

const CampaignForm = () => {
  const { id = "new" } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = useCan("marketing.manage")
  const { singleData, singleStatus, singleError } = useAppSelector((state) => state.campaigns)
  const [searchParams] = useSearchParams()
  const isEditing = id !== "new"
  const existing = isEditing && singleData?.id === id ? (singleData as EmailCampaign) : null

  useDocumentTitle(existing ? `Edit ${existing.name}` : "New campaign")

  const {
    register,
    reset,
    control,
    watch,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema),
    defaultValues: { ...defaultValues, channel: searchParams.get("channel") === "sms" ? "sms" : "email" },
  })
  const channel = watch("channel")
  const body = watch("body")
  const isSms = channel === "sms"

  const [footerLength, setFooterLength] = useState<number | null>(null)
  useEffect(() => {
    if (!isSms) return
    const controller = new AbortController()
    fetchCampaignAudience(controller.signal).then(
      (audience) => setFooterLength(audience.sms_footer_length),
      () => {
        // The counter still works without the footer allowance.
      }
    )
    return () => controller.abort()
  }, [isSms])

  const loadCampaign = useCallback(() => dispatch(fetchSingle(id)), [dispatch, id])

  useEffect(() => {
    if (!isEditing) return
    const request = loadCampaign()
    return () => request.abort()
  }, [isEditing, loadCampaign])

  const [syncedFor, setSyncedFor] = useState<EmailCampaign | null>(null)
  if (existing && existing !== syncedFor) {
    setSyncedFor(existing)
    reset({ name: existing.name, channel: existing.channel, subject: existing.subject, body: existing.body })
  }

  const backTo = existing ? `/campaign_detail/${existing.id}` : "/campaigns"

  if (!canManage) return <Navigate to={isEditing ? `/campaign_detail/${id}` : "/campaigns"} replace />

  const pageState = isEditing ? resolveDetailState(singleStatus, singleError, !!existing) : null
  if (pageState) {
    return (
      <DetailPageState
        state={pageState}
        entity="Campaign"
        backTo="/campaigns"
        backLabel="Back to campaigns"
        error={singleError}
        onRetry={loadCampaign}
      />
    )
  }

  // Only a draft can be edited; anything else is shown on its detail page.
  if (existing && existing.status !== "draft") return <Navigate to={`/campaign_detail/${existing.id}`} replace />

  const onSubmit = async (values: CampaignFormValues) => {
    const payload: EmailCampaignPayload = {
      name: values.name.trim(),
      subject: values.channel === "sms" ? "" : values.subject.trim(),
      body: values.body,
      ...(existing ? {} : { channel: values.channel }),
    }
    try {
      if (existing) {
        await dispatch(patchData({ id: existing.id, payload })).unwrap()
        toast.success(`${payload.name} saved`)
        navigate(`/campaign_detail/${existing.id}`)
      } else {
        const created = await dispatch(postData({ payload })).unwrap()
        toast.success(`${payload.name} saved as a draft`)
        navigate(`/campaign_detail/${created.id}`)
      }
    } catch (err) {
      reportFormError(err, { setError, fields: FORM_FIELDS, fallback: "Couldn't save this campaign" })
    }
  }

  return (
    <div className="section-container space-y-6">
      <PageHeader
        title={isEditing ? "Edit Campaign" : "New Campaign"}
        back={{ to: backTo, label: isEditing ? "Back to campaign" : "Back to campaigns" }}
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Message</CardTitle>
            <CardDescription>
              Saved as a draft. Send yourself a test from the next page, then schedule it.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField
              label="Name"
              id="name"
              description="For your team only; subscribers never see it."
              error={errors.name}
              {...register("name")}
            />
            <SelectField
              control={control}
              name="channel"
              label="Channel"
              id="channel"
              options={channelOptions}
              disabled={isEditing}
              description={isEditing ? "A campaign keeps its channel." : undefined}
            />
            {!isSms && <TextField label="Subject" id="subject" error={errors.subject} {...register("subject")} />}
            <TextareaField
              label="Message"
              id="body"
              rows={isSms ? 6 : 16}
              className="md:col-span-2"
              description={
                isSms
                  ? "Plain text. Sent only to customers who opted in to SMS; an opt-out link is added to every text."
                  : "Plain text, sent exactly as written. An unsubscribe footer with your business name and address is added to every email."
              }
              error={errors.body}
              {...register("body")}
            />
            {isSms && <SmsCounter body={body} footerLength={footerLength} />}
          </CardContent>
        </Card>
        <FormActions
          sticky
          onCancel={() => navigate(backTo)}
          submitLabel={isEditing ? "Save Changes" : "Save Draft"}
          submitting={isSubmitting}
          submitDisabled={isEditing && !isDirty}
        />
      </form>
    </div>
  )
}

export default CampaignForm
