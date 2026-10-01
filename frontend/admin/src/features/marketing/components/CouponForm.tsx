import { useCallback, useEffect, useState } from "react"
import { Controller, useForm, type Path } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { DetailPageState } from "@/components/common/DetailPageState"

import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchSingle, patchData, postData } from "@/features/marketing/slices/couponSlice"
import type { Coupon, CouponCreatePayload, CouponUpdatePayload } from "@/features/marketing/types"
import { useCan } from "@/features/system/permissions"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
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
  const canManage = useCan()("orders.manage")
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
      const fieldErrors = getApiFieldErrors(err)
      const known = Object.entries(fieldErrors).filter(([field]) => FORM_FIELDS.includes(field))
      known.forEach(([field, message]) => setError(field as Path<CouponFormValues>, { message }))
      if (!known.length) toast.error(getApiErrorMessage(err, "Couldn't save this coupon"))
    }
  }

  const title = readOnly ? "Coupon Details" : isEditing ? "Edit Coupon" : "Add Coupon"

  return (
    <div className="section-container space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="back" size="icon" onClick={() => navigate("/coupons")} aria-label="Back to coupons">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">
            {existing
              ? `Used ${existing.times_used} time${existing.times_used === 1 ? "" : "s"}${
                  existing.usage_limit != null ? ` of ${existing.usage_limit}` : ""
                }`
              : "Create a new discount code"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Coupon Details</CardTitle>
          </CardHeader>
          <CardContent>
            <fieldset disabled={readOnly} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="code">Coupon Code</FieldLabel>
                <FieldContent>
                  <Input id="code" placeholder="e.g. WELCOME10" className="font-mono uppercase" {...register("code")} />
                  <FieldError errors={[errors.code]} />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="discount_type">Discount Type</FieldLabel>
                <FieldContent>
                  <Controller
                    control={control}
                    name="discount_type"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                        <SelectTrigger id="discount_type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">Percentage</SelectItem>
                          <SelectItem value="fixed">Fixed amount</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.discount_type]} />
                </FieldContent>
              </Field>

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

              <Field>
                <FieldLabel htmlFor="expires_at">Expires At</FieldLabel>
                <FieldContent>
                  <Input id="expires_at" type="datetime-local" {...register("expires_at")} />
                  <FieldDescription>Leave empty for a coupon that never expires.</FieldDescription>
                  <FieldError errors={[errors.expires_at]} />
                </FieldContent>
              </Field>

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
            <CardFooter className="justify-end gap-3 border-t p-4">
              <Button type="button" variant="outline" onClick={() => navigate("/coupons")}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || (isEditing && !isDirty)}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isEditing ? "Save Changes" : "Create Coupon"}
              </Button>
            </CardFooter>
          )}
        </Card>
      </form>
    </div>
  )
}

export default CouponForm
