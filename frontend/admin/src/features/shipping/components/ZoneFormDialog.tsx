import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { useAppDispatch } from "@/app/hooks"
import { createZone, updateZone } from "@/features/shipping/slices/zoneSlice"
import type { ShippingZone, ShippingZonePayload } from "@/features/shipping/types"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"

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
  onSaved: () => void
}

export function ZoneFormDialog({ open, onOpenChange, zone, onSaved }: ZoneFormDialogProps) {
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
        await dispatch(createZone(payload)).unwrap()
        toast.success(`${payload.name} created`)
      }
      onOpenChange(false)
      onSaved()
    } catch (err) {
      const fields = getApiFieldErrors(err)
      if (fields.name) setError("name", { message: fields.name })
      if (fields.country_codes) setError("areas", { message: fields.country_codes })
      toast.error(getApiErrorMessage(err, "Failed to save zone"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{zone ? `Edit ${zone.name}` : "New delivery zone"}</DialogTitle>
          <DialogDescription>
            An order lands in this zone when its ship-to address mentions one of the zone's areas.
          </DialogDescription>
        </DialogHeader>

        <form id="zone-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Field>
            <FieldLabel htmlFor="zone-name">Name *</FieldLabel>
            <FieldContent>
              <Input id="zone-name" placeholder="e.g. Inside Dhaka" aria-invalid={!!errors.name} {...register("name")} />
              <FieldError errors={[errors.name]} />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="zone-areas">Areas</FieldLabel>
            <FieldContent>
              <Textarea
                id="zone-areas"
                rows={4}
                placeholder="dhaka, gulshan, banani, uttara"
                aria-invalid={!!errors.areas}
                {...register("areas")}
              />
              <FieldDescription>Comma or newline separated keywords matched against the address.</FieldDescription>
              <FieldError errors={[errors.areas]} />
            </FieldContent>
          </Field>
          {zone && (
            <Controller
              control={control}
              name="is_active"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="zone-active">Active</FieldLabel>
                  </FieldContent>
                  <Switch id="zone-active" checked={field.value} onCheckedChange={field.onChange} />
                </Field>
              )}
            />
          )}
        </form>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="zone-form" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {zone ? "Save changes" : "Create zone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
