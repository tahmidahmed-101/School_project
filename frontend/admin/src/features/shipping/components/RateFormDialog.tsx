import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAppDispatch } from "@/app/hooks"
import { createZoneRate } from "@/features/shipping/slices/zoneSlice"
import { updateRate } from "@/features/shipping/slices/rateSlice"
import type { Carrier, ShippingRate, ShippingZone } from "@/features/shipping/types"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"

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
  zones: ShippingZone[]
  carriers: Carrier[]
  defaultZoneId?: string
  onSaved: () => void
}

export function RateFormDialog({ open, onOpenChange, rate, zones, carriers, defaultZoneId, onSaved }: RateFormDialogProps) {
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
          createZoneRate({ zoneId: values.zone_id, payload: { ...numbers, carrier_id: values.carrier_id } })
        ).unwrap()
        toast.success("Rate added")
      }
      onOpenChange(false)
      onSaved()
    } catch (err) {
      for (const [field, message] of Object.entries(getApiFieldErrors(err))) {
        if (field in schema.shape) setError(field as keyof FormValues, { message })
      }
      toast.error(getApiErrorMessage(err, "Failed to save rate"))
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{rate ? "Edit rate" : "Add rate"}</DialogTitle>
          <DialogDescription>
            Charge = base charge up to the base weight, plus the increment charge per started increment above it.
          </DialogDescription>
        </DialogHeader>

        <form id="rate-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {picker("zone_id", "Zone", zones)}
            {picker("carrier_id", "Carrier", carriers)}
            {numberField("base_weight", "Base weight", "0.001", "kg")}
            {numberField("base_charge", "Base charge", "0.01", "BDT")}
            {numberField("increment_weight", "Increment weight", "0.001", "kg")}
            {numberField("increment_charge", "Increment charge", "0.01", "BDT")}
          </div>
          {rate && <FieldDescription>Zone and carrier can't change — delete the rate and add a new one.</FieldDescription>}
        </form>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="rate-form" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {rate ? "Save changes" : "Add rate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
