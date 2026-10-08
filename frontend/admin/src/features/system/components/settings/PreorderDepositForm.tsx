import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Save } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SubmitButton } from "@/components/common/FormActions"
import { TextField } from "@/components/common/form-fields"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchBusinessProfile, updateBusinessProfile } from "@/features/system/slices/businessSettingsSlice"
import type { BusinessProfile } from "@/features/system/types"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { SectionState } from "./SectionState"

const schema = z.object({
  preorder_deposit_percent: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter a percentage from 0 to 100")
    .refine((value) => Number(value) <= 100, "Enter a percentage from 0 to 100"),
})
type FormValues = z.infer<typeof schema>

export function PreorderDepositForm({ canManage }: { canManage: boolean }) {
  const dispatch = useAppDispatch()
  const { data: profile, status, error } = useAppSelector((state) => state.businessSettings.profile)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { preorder_deposit_percent: "" } })

  const [syncedFor, setSyncedFor] = useState<BusinessProfile | null>(null)
  if (profile && profile !== syncedFor) {
    setSyncedFor(profile)
    reset({ preorder_deposit_percent: profile.preorder_deposit_percent ?? "" })
  }

  if (!profile) {
    return (
      <SectionState
        status={status}
        error={error}
        hasData={false}
        onRetry={() => dispatch(fetchBusinessProfile())}
        label="the deposit setting"
      />
    )
  }

  const onSubmit = async (values: FormValues) => {
    try {
      await dispatch(updateBusinessProfile(values)).unwrap()
      toast.success("Deposit saved")
    } catch (err) {
      const message = getApiFieldErrors(err).preorder_deposit_percent
      if (message) setError("preorder_deposit_percent", { message })
      else toast.error(getApiErrorMessage(err, "Couldn't save the deposit"))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deposit</CardTitle>
        <CardDescription>
          How much of a pre-order must be paid before it is confirmed. The rest is collected later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col items-start gap-4">
          <TextField
            label="Deposit (% of order total)"
            id="preorder-deposit-percent"
            className="w-full max-w-xs"
            inputMode="decimal"
            disabled={!canManage}
            description="100 means the full amount in advance. 0 confirms a cash-on-delivery pre-order with nothing paid."
            error={errors.preorder_deposit_percent}
            {...register("preorder_deposit_percent")}
          />
          {canManage && (
            <SubmitButton loading={isSubmitting} icon={Save} disabled={!isDirty}>
              Save deposit
            </SubmitButton>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
