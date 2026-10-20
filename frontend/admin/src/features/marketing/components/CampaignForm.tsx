import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Navigate, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DetailPageState } from "@/components/common/DetailPageState"
import { PageHeader } from "@/components/common/PageHeader"
import { FormActions } from "@/components/common/FormActions"
import { TextField, TextareaField } from "@/components/common/form-fields"

import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchSingle, patchData, postData } from "@/features/marketing/slices/campaignSlice"
import type { EmailCampaign, EmailCampaignPayload } from "@/features/marketing/types"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { reportFormError } from "@/lib/forms"
import { resolveDetailState } from "@/lib/detailState"

// Limits from AdminCampaignWriteSerializer.
const campaignSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120, "Keep the name to 120 characters"),
  subject: z.string().trim().min(1, "Enter a subject line").max(200, "Keep the subject to 200 characters"),
  body: z
    .string()
    .refine((value) => value.trim().length > 0, "Write the message")
    .refine((value) => value.length <= 50_000, "Keep the message to 50,000 characters"),
})

type CampaignFormValues = z.infer<typeof campaignSchema>

const defaultValues: CampaignFormValues = { name: "", subject: "", body: "" }
const FORM_FIELDS = Object.keys(defaultValues)

const CampaignForm = () => {
  const { id = "new" } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = useCan("marketing.manage")
  const { singleData, singleStatus, singleError } = useAppSelector((state) => state.campaigns)
  const isEditing = id !== "new"
  const existing = isEditing && singleData?.id === id ? (singleData as EmailCampaign) : null

  useDocumentTitle(existing ? `Edit ${existing.name}` : "New campaign")

  const {
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CampaignFormValues>({ resolver: zodResolver(campaignSchema), defaultValues })

  const loadCampaign = useCallback(() => dispatch(fetchSingle(id)), [dispatch, id])

  useEffect(() => {
    if (!isEditing) return
    const request = loadCampaign()
    return () => request.abort()
  }, [isEditing, loadCampaign])

  const [syncedFor, setSyncedFor] = useState<EmailCampaign | null>(null)
  if (existing && existing !== syncedFor) {
    setSyncedFor(existing)
    reset({ name: existing.name, subject: existing.subject, body: existing.body })
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
      subject: values.subject.trim(),
      body: values.body,
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
            <TextField label="Subject" id="subject" error={errors.subject} {...register("subject")} />
            <TextareaField
              label="Message"
              id="body"
              rows={16}
              className="md:col-span-2"
              description="Plain text, sent exactly as written. An unsubscribe footer with your business name and address is added to every email."
              error={errors.body}
              {...register("body")}
            />
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
