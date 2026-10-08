import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { Input } from "@/components/ui/input"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormDialog } from "@/components/common/FormDialog"
import { useAppDispatch } from "@/app/hooks"
import { createZoneRate } from "@/features/shipping/slices/zoneSlice"
import { updateRate } from "@/features/shipping/slices/rateSlice"
import type { Carrier, ShippingRate, ShippingZone } from "@/features/shipping/types"
import type { Kind } from "@/hooks/use-kind"
import { reportFormError } from "@/lib/forms"
import { getDefaultCurrency } from "@/lib/format"

const nonNegative = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, `${label} can't be negative`)

const schema = z.object({
  zone_id: z.string().min(1, "Pick a zone"),
  carrier_id: z.string().min(1, "Pick a carrier"),
  base_weight: nonNegative("Base weight"),
  base_charge: nonNegative("Base charge"),
  increment_weight: nonNegative("Increment weight").refine((v) => Number(v) > 0, "Increment weight must be above 0"),
  increment_charge: nonNegative("Increment charge"),
})
type FormValues = z.infer<typeof schema>
type NumberField = "base_weight" | "base_charge" | "increment_weight" | "increment_charge"

interface RateFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Rate being edited (zone/carrier then fixed), or null to add one. */
  rate: ShippingRate | null
  /** The half of the dashboard the page belongs to; a new rate is created in it. */
  kind: Kind
  zones: ShippingZone[]
  carriers: Carrier[]
  defaultZoneId?: string
  onSaved: () => void
}

export function RateFormDialog({
  open,
  onOpenChange,
  rate,
  kind,
  zones,
  carriers,
  defaultZoneId,
  onSaved,
}: RateFormDialogProps) {
  const dispatch = useAppDispatch()
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      zone_id: "",
      carrier_id: "",
      base_weight: "1",
      base_charge: "",
      increment_weight: "1",
      increment_charge: "0",
    },
  })

  useEffect(() => {
    if (!open) return
    reset({
      zone_id: rate?.zone_id ?? defaultZoneId ?? "",
      carrier_id: rate?.carrier_id ?? "",
      base_weight: rate?.base_weight ?? "1",
      base_charge: rate?.base_charge ?? "",
      increment_weight: rate?.increment_weight ?? "1",
      increment_charge: rate?.increment_charge ?? "0",
    })
  }, [open, rate, defaultZoneId, reset])

  const onSubmit = async (values: FormValues) => {
    const numbers = {
      base_weight: values.base_weight,
      base_charge: values.base_charge,
      increment_weight: values.increment_weight,
      increment_charge: values.increment_charge,
    }
    try {
      if (rate) {
        await dispatch(updateRate({ id: rate.id, payload: numbers })).unwrap()
        toast.success("Rate updated")
      } else {
        await dispatch(
          createZoneRate({ zoneId: values.zone_id, payload: { ...numbers, carrier_id: values.carrier_id, kind } })
        ).unwrap()
        toast.success("Rate added")
      }
      onOpenChange(false)
      onSaved()
    } catch (err) {
      reportFormError(err, { setError, fields: Object.keys(schema.shape), fallback: "Failed to save rate" })
    }
  }

  const numberField = (name: NumberField, label: string, step: string, unit: string) => (
    <Field>
      <FieldLabel htmlFor={`rate-${name}`}>
        {label} <span className="text-muted-foreground">({unit})</span>
      </FieldLabel>
      <FieldContent>
        <Input
          id={`rate-${name}`}
          type="number"
          min="0"
          step={step}
          aria-invalid={!!errors[name]}
          {...register(name)}
        />
        <FieldError errors={[errors[name]]} />
      </FieldContent>
    </Field>
  )

  const picker = (name: "zone_id" | "carrier_id", label: string, items: { id: string; name: string }[]) => (
    <Field>
      <FieldLabel htmlFor={`rate-${name}`}>{label}</FieldLabel>
      <FieldContent>
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={!!rate}>
              <SelectTrigger id={`rate-${name}`} aria-invalid={!!errors[name]}>
                <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError errors={[errors[name]]} />
      </FieldContent>
    </Field>
  )

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={rate ? "Edit rate" : "Add rate"}
      description="Charge = base charge up to the base weight, plus the increment charge per started increment above it."
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={rate ? "Save changes" : "Add rate"}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {picker("zone_id", "Zone", zones)}
        {picker("carrier_id", "Carrier", carriers)}
        {numberField("base_weight", "Base weight", "0.001", "kg")}
        {numberField("base_charge", "Base charge", "0.01", getDefaultCurrency())}
        {numberField("increment_weight", "Increment weight", "0.001", "kg")}
        {numberField("increment_charge", "Increment charge", "0.01", getDefaultCurrency())}
      </div>
      {rate && <FieldDescription>Zone and carrier can't change — delete the rate and add a new one.</FieldDescription>}
    </FormDialog>
  )
}
