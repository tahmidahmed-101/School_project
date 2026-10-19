import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Save } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SubmitButton } from "@/components/common/FormActions"
import { TextareaField } from "@/components/common/form-fields"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchBusinessProfile, updateBusinessProfile } from "@/features/system/slices/businessSettingsSlice"
import type { BusinessProfile } from "@/features/system/types"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { SectionState } from "./SectionState"

const TERMS = z.string().trim().max(10000, "At most 10,000 characters")
const schema = z.object({ preorder_terms_en: TERMS, preorder_terms_bn: TERMS })
type FormValues = z.infer<typeof schema>

/**
 * The terms a customer accepts before placing a pre-order, in English and Bangla; the storefront shows the
 * shopper's language, or the other one when that is empty. Both empty, none are shown.
 */
export function PreorderTermsCard({ canManage }: { canManage: boolean }) {
  const dispatch = useAppDispatch()
  const { data: profile, status, error } = useAppSelector((state) => state.businessSettings.profile)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { preorder_terms_en: "", preorder_terms_bn: "" },
  })

  const [syncedFor, setSyncedFor] = useState<BusinessProfile | null>(null)
  if (profile && profile !== syncedFor) {
    setSyncedFor(profile)
    reset({ preorder_terms_en: profile.preorder_terms_en ?? "", preorder_terms_bn: profile.preorder_terms_bn ?? "" })
  }

  if (!profile) {
    return (
      <SectionState
        status={status}
        error={error}
        hasData={false}
        onRetry={() => dispatch(fetchBusinessProfile())}
        label="the pre-order terms"
      />
    )
  }

  const onSubmit = async (values: FormValues) => {
    try {
      await dispatch(updateBusinessProfile(values)).unwrap()
      toast.success("Terms saved")
    } catch (err) {
      const fields = getApiFieldErrors(err)
      const failed = (["preorder_terms_en", "preorder_terms_bn"] as const).filter((name) => fields[name])
      failed.forEach((name) => setError(name, { message: fields[name] }))
      if (failed.length === 0) toast.error(getApiErrorMessage(err, "Couldn't save the terms"))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pre-order terms</CardTitle>
        <CardDescription>
          Shown when a customer confirms a pre-order; they accept them to place it. Leave empty for no terms.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col items-start gap-4">
          <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
            <TextareaField
              label="Terms (English)"
              id="preorder-terms-en"
              rows={8}
              disabled={!canManage}
              placeholder="e.g. The advance payment is non-refundable. Delivery dates may change."
              error={errors.preorder_terms_en}
              {...register("preorder_terms_en")}
            />
            <TextareaField
              label="Terms (Bangla)"
              id="preorder-terms-bn"
              rows={8}
              disabled={!canManage}
              placeholder="যেমন: অগ্রিম অর্থ ফেরতযোগ্য নয়। ডেলিভারির তারিখ পরিবর্তন হতে পারে।"
              error={errors.preorder_terms_bn}
              {...register("preorder_terms_bn")}
            />
          </div>
          {canManage && (
            <SubmitButton loading={isSubmitting} icon={Save} disabled={!isDirty}>
              Save terms
            </SubmitButton>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
