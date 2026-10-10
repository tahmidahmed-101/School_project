import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Save } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SubmitButton } from "@/components/common/FormActions"
import { MoneyField } from "@/components/common/form-fields"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchBusinessProfile, updateBusinessProfile } from "@/features/system/slices/businessSettingsSlice"
import type { BusinessProfile } from "@/features/system/types"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { moneySchema } from "@/lib/forms"
import { SectionState } from "./SectionState"

const schema = z.object({ free_delivery_min_amount: moneySchema })
type FormValues = z.infer<typeof schema>

export function FreeDeliveryForm({ canManage }: { canManage: boolean }) {
  const dispatch = useAppDispatch()
  const { data: profile, status, error } = useAppSelector((state) => state.businessSettings.profile)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { free_delivery_min_amount: "" } })

  const [syncedFor, setSyncedFor] = useState<BusinessProfile | null>(null)
  if (profile && profile !== syncedFor) {
    setSyncedFor(profile)
    reset({ free_delivery_min_amount: profile.free_delivery_min_amount ?? "" })
  }

  if (!profile) {
    return (
      <SectionState
        status={status}
        error={error}
        hasData={false}
        onRetry={() => dispatch(fetchBusinessProfile())}
        label="the free delivery setting"
      />
    )
  }

  const onSubmit = async (values: FormValues) => {
    try {
      await dispatch(
        updateBusinessProfile({ free_delivery_min_amount: values.free_delivery_min_amount || null })
      ).unwrap()
      toast.success("Free delivery saved")
    } catch (err) {
      const message = getApiFieldErrors(err).free_delivery_min_amount
      if (message) setError("free_delivery_min_amount", { message })
      else toast.error(getApiErrorMessage(err, "Couldn't save free delivery"))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Free delivery</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <MoneyField
            showCurrency
            label="Free delivery on orders of at least"
            id="free-delivery-min-amount"
            className="w-full max-w-xs"
            disabled={!canManage}
            description="Leave empty to always charge delivery. Stock orders only."
            error={errors.free_delivery_min_amount}
            {...register("free_delivery_min_amount")}
          />
          {canManage && (
            <SubmitButton loading={isSubmitting} icon={Save} disabled={!isDirty}>
              Save free delivery
            </SubmitButton>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
