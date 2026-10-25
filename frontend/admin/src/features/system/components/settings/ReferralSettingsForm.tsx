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

const schema = z.object({ referral_friend_discount: moneySchema, referral_reward_amount: moneySchema })
type FormValues = z.infer<typeof schema>

const isOn = (profile: BusinessProfile) =>
  Number(profile.referral_friend_discount ?? 0) > 0 && Number(profile.referral_reward_amount ?? 0) > 0

export function ReferralSettingsForm({ canManage }: { canManage: boolean }) {
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
    defaultValues: { referral_friend_discount: "", referral_reward_amount: "" },
  })

  const [syncedFor, setSyncedFor] = useState<BusinessProfile | null>(null)
  if (profile && profile !== syncedFor) {
    setSyncedFor(profile)
    reset({
      referral_friend_discount: profile.referral_friend_discount ?? "",
      referral_reward_amount: profile.referral_reward_amount ?? "",
    })
  }

  if (!profile) {
    return (
      <SectionState
        status={status}
        error={error}
        hasData={false}
        onRetry={() => dispatch(fetchBusinessProfile())}
        label="the referral settings"
      />
    )
  }

  const onSubmit = async (values: FormValues) => {
    try {
      await dispatch(
        updateBusinessProfile({
          referral_friend_discount: values.referral_friend_discount || null,
          referral_reward_amount: values.referral_reward_amount || null,
        })
      ).unwrap()
      toast.success("Referral settings saved")
    } catch (err) {
      const fields = getApiFieldErrors(err)
      if (fields.referral_friend_discount) setError("referral_friend_discount", { message: fields.referral_friend_discount })
      else if (fields.referral_reward_amount) setError("referral_reward_amount", { message: fields.referral_reward_amount })
      else toast.error(getApiErrorMessage(err, "Couldn't save the referral settings"))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Referral program: {isOn(profile) ? "On" : "Off"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <MoneyField
            showCurrency
            label="Friend's discount on their first order"
            id="referral-friend-discount"
            className="w-full max-w-xs"
            disabled={!canManage}
            description="Fixed amount. Leave empty or 0 to turn the program off."
            error={errors.referral_friend_discount}
            {...register("referral_friend_discount")}
          />
          <MoneyField
            showCurrency
            label="Reward for the customer who shared the code"
            id="referral-reward-amount"
            className="w-full max-w-xs"
            disabled={!canManage}
            description="Given as a single-use coupon once the friend's order is delivered."
            error={errors.referral_reward_amount}
            {...register("referral_reward_amount")}
          />
          {canManage && (
            <SubmitButton
              loading={isSubmitting}
              icon={Save}
              disabled={!isDirty}
              size="action"
              className="h-11 lg:mt-[calc(0.875rem*1.375+0.5rem)]"
            >
              Save referral settings
            </SubmitButton>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
