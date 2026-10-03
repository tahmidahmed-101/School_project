import { useCallback, useEffect, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { DetailPageState } from "@/components/common/DetailPageState"
import { PageHeader } from "@/components/common/PageHeader"
import { FormActions } from "@/components/common/FormActions"
import { DateField, SelectField, TextField } from "@/components/common/form-fields"

import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchSingle, patchData, postData } from "@/features/marketing/slices/couponSlice"
import type { Coupon, CouponCreatePayload, CouponUpdatePayload } from "@/features/marketing/types"
import { useCan } from "@/hooks/use-can"
import { reportFormError } from "@/lib/forms"
import { resolveDetailState } from "@/lib/detailState"
import { fromDatetimeLocal, getDefaultCurrency, toDatetimeLocal } from "@/lib/format"
import { useDocumentTitle } from "@/hooks/use-document-title"

const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Enter a code")
      .max(32, "Codes can be at most 32 characters"),
    discount_type: z.enum(["percentage", "fixed"]),
    value: z.number({ error: "Enter a discount value" }).gt(0, "Discount must be greater than 0"),
    min_order_amount: z.number({ error: "Enter a minimum order amount" }).min(0, "Can't be negative"),
    usage_limit: z.number().int("Must be a whole number").min(1, "Must be at least 1").nullable(),
    expires_at: z.string(),
    is_active: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.discount_type === "percentage" && values.value > 100) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "A percentage can't exceed 100" })
    }
  })

type CouponFormValues = z.infer<typeof couponSchema>

const defaultValues: CouponFormValues = {
  code: "",
  discount_type: "percentage",
  value: 10,
  min_order_amount: 0,
  usage_limit: null,
  expires_at: "",
  is_active: true,
}

const FORM_FIELDS = Object.keys(defaultValues)

const CouponForm = () => {
  const { id = "new" } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = useCan("orders.manage")
  const { singleData, singleStatus, singleError } = useAppSelector((state) => state.coupons)
  const isEditing = id !== "new"
  const existing = isEditing && singleData?.id === id ? (singleData as Coupon) : null
  const readOnly = !canManage

  useDocumentTitle(existing ? `${existing.code} — Coupon` : isEditing ? "Coupon" : "Add Coupon")

  const {
    control,
    register,
    reset,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CouponFormValues>({ resolver: zodResolver(couponSchema), defaultValues })
  const discountType = watch("discount_type")

  const loadCoupon = useCallback(() => dispatch(fetchSingle(id)), [dispatch, id])

  useEffect(() => {
    if (!isEditing) return
    const request = loadCoupon()
    return () => request.abort()
  }, [isEditing, loadCoupon])

  const [syncedFor, setSyncedFor] = useState<Coupon | null>(null)
  if (existing && existing !== syncedFor) {
    setSyncedFor(existing)
    reset({
      code: existing.code,
      discount_type: existing.discount_type,
      value: Number(existing.value),
      min_order_amount: Number(existing.min_order_amount),
      usage_limit: existing.usage_limit,
      expires_at: toDatetimeLocal(existing.expires_at),
      is_active: existing.is_active,
    })
  }

  const pageState = isEditing ? resolveDetailState(singleStatus, singleError, !!existing) : null
  if (pageState) {
    return (
      <DetailPageState
        state={pageState}
        entity="Coupon"
        backTo="/coupons"
        backLabel="Back to Coupons"
        error={singleError}
        onRetry={loadCoupon}
      />
    )
  }

  const onSubmit = async (values: CouponFormValues) => {
    const base: CouponCreatePayload = {
      code: values.code.trim().toUpperCase(),
      discount_type: values.discount_type,
      value: values.value.toFixed(2),
      min_order_amount: values.min_order_amount.toFixed(2),
      usage_limit: values.usage_limit,
      expires_at: fromDatetimeLocal(values.expires_at),
    }

    try {
      if (existing) {
        const payload: CouponUpdatePayload = { ...base, is_active: values.is_active }
        await dispatch(patchData({ id: existing.id, payload: payload as Partial<Coupon> })).unwrap()
        toast.success(`Coupon ${base.code} updated`)
      } else {
        const created = await dispatch(postData({ payload: base as Partial<Coupon> })).unwrap()
        // The create endpoint has no is_active field — new coupons start active.
        if (!values.is_active) {
          await dispatch(patchData({ id: created.id, payload: { is_active: false } })).unwrap()
        }
        toast.success(`Coupon ${base.code} created`)
      }
      navigate("/coupons")
    } catch (err) {
      reportFormError(err, { setError, fields: FORM_FIELDS, fallback: "Couldn't save this coupon" })
    }
  }

  const title = readOnly ? "Coupon Details" : isEditing ? "Edit Coupon" : "Add Coupon"

  return (
    <div className="section-container space-y-6">
      <PageHeader
        title={title}
        description={
          existing
            ? `Used ${existing.times_used} time${existing.times_used === 1 ? "" : "s"}${
                existing.usage_limit != null ? ` of ${existing.usage_limit}` : ""
              }`
            : undefined
        }
        back={{ to: "/coupons", label: "Back to coupons" }}
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Coupon Details</CardTitle>
          </CardHeader>
          <CardContent>
            <fieldset disabled={readOnly} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextField
                label="Coupon Code"
                id="code"
                inputClassName="font-mono uppercase"
                placeholder="e.g. WELCOME10"
                error={errors.code}
                {...register("code")}
              />

              <SelectField
                control={control}
                name="discount_type"
                label="Discount Type"
                id="discount_type"
                disabled={readOnly}
                options={[{ label: "Percentage", value: "percentage" }, { label: "Fixed amount", value: "fixed" }]}
              />

              <Field>
                <FieldLabel htmlFor="value">
                  {discountType === "percentage" ? "Discount (%)" : `Discount (${getDefaultCurrency()})`}
                </FieldLabel>
                <FieldContent>
                  <Input id="value" type="number" step="0.01" min="0" {...register("value", { valueAsNumber: true })} />
                  <FieldError errors={[errors.value]} />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="min_order_amount">Minimum Order ({getDefaultCurrency()})</FieldLabel>
                <FieldContent>
                  <Input
                    id="min_order_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    {...register("min_order_amount", { valueAsNumber: true })}
                  />
                  <FieldDescription>0 means no minimum.</FieldDescription>
                  <FieldError errors={[errors.min_order_amount]} />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="usage_limit">Usage Limit</FieldLabel>
                <FieldContent>
                  <Controller
                    control={control}
                    name="usage_limit"
                    render={({ field }) => (
                      <Input
                        id="usage_limit"
                        type="number"
                        min="1"
                        placeholder="Unlimited"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                      />
                    )}
                  />
                  <FieldDescription>Total redemptions across all customers. Leave empty for unlimited.</FieldDescription>
                  <FieldError errors={[errors.usage_limit]} />
                </FieldContent>
              </Field>

              <DateField
                label="Expires At"
                id="expires_at"
                withTime
                description="Leave empty for a coupon that never expires."
                error={errors.expires_at}
                {...register("expires_at")}
              />

              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="is_active">Active</FieldLabel>
                  <FieldDescription>Inactive coupons are rejected at checkout.</FieldDescription>
                </FieldContent>
                <Controller
                  control={control}
                  name="is_active"
                  render={({ field }) => (
                    <Switch id="is_active" checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} />
                  )}
                />
              </Field>
            </fieldset>
          </CardContent>
          {!readOnly && (
            <CardFooter className="justify-end border-t p-4">
              <FormActions
                onCancel={() => navigate("/coupons")}
                submitLabel={isEditing ? "Save Changes" : "Create Coupon"}
                submitting={isSubmitting}
                submitDisabled={(isEditing && !isDirty)}
              />
            </CardFooter>
          )}
        </Card>
      </form>
    </div>
  )
}

export default CouponForm
