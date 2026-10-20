import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { FormDialog, SwitchField } from "@/components/common/FormDialog"
import { TextField, TextareaField } from "@/components/common/form-fields"
import { useAppDispatch } from "@/app/hooks"
import { createZone, updateZone } from "@/features/shipping/slices/zoneSlice"
import type { ShippingZone, ShippingZonePayload } from "@/features/shipping/types"
import type { Kind } from "@/hooks/use-kind"
import { reportFormError } from "@/lib/forms"

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  areas: z.string(),
  is_active: z.boolean(),
})
type FormValues = z.infer<typeof schema>

const parseAreas = (raw: string) =>
  Array.from(
    new Set(
      raw
        .split(/[,\n]/)
        .map((a) => a.trim())
        .filter(Boolean)
    )
  )

interface ZoneFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  zone: ShippingZone | null
  /** The half of the dashboard the page belongs to; a new zone is created in it. */
  kind: Kind
  onSaved: () => void
}

export function ZoneFormDialog({ open, onOpenChange, zone, kind, onSaved }: ZoneFormDialogProps) {
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
    defaultValues: { name: "", areas: "", is_active: true },
  })

  useEffect(() => {
    if (open) {
      reset({
        name: zone?.name ?? "",
        areas: (zone?.country_codes ?? []).join(", "),
        is_active: zone?.is_active ?? true,
      })
    }
  }, [open, zone, reset])

  const onSubmit = async (values: FormValues) => {
    const payload: ShippingZonePayload = { name: values.name.trim(), country_codes: parseAreas(values.areas) }
    if (zone) payload.is_active = values.is_active
    try {
      if (zone) {
        await dispatch(updateZone({ id: zone.id, payload })).unwrap()
        toast.success(`${payload.name} updated`)
      } else {
        await dispatch(createZone({ ...payload, kind })).unwrap()
        toast.success(`${payload.name} created`)
      }
      onOpenChange(false)
      onSaved()
    } catch (err) {
      reportFormError(err, {
        setError,
        fields: ["name", "areas"],
        fieldMap: { country_codes: "areas" },
        fallback: "Failed to save zone",
      })
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={zone ? `Edit ${zone.name}` : "New delivery zone"}
      description={
        kind === "preorder"
          ? "A pre-order lands in this zone when its ship-to address mentions one of the zone's areas."
          : "An order lands in this zone when its ship-to address mentions one of the zone's areas."
      }
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={zone ? "Save changes" : "Create zone"}
    >
      <TextField
        label="Name *"
        id="zone-name"
        placeholder="e.g. Inside Dhaka"
        error={errors.name}
        {...register("name")}
      />
      <TextareaField
        label="Areas"
        id="zone-areas"
        rows={4}
        placeholder="dhaka, gulshan, banani, uttara"
        description="Comma or newline separated keywords matched against the address."
        error={errors.areas}
        {...register("areas")}
      />
      {zone && <SwitchField control={control} name="is_active" label="Status" onLabel="Active" offLabel="Inactive" />}
    </FormDialog>
  )
}
