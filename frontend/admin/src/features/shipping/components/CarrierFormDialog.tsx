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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAppDispatch } from "@/app/hooks"
import { createCarrier, updateCarrier } from "@/features/shipping/slices/carrierSlice"
import {
  CARRIER_PROVIDER_OPTIONS,
  type Carrier,
  type CarrierPayload,
  type CarrierProvider,
} from "@/features/shipping/types"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  code: z.enum(["pathao", "steadfast", "redx", "manual"]),
  phone: z.string(),
  contact_email: z.union([z.literal(""), z.email("Enter a valid email")]),
  api_base_url: z.string(),
  api_key: z.string(),
  api_secret: z.string(),
  webhook_secret: z.string(),
  is_integration_enabled: z.boolean(),
  is_active: z.boolean(),
  config: z.string().refine((v) => {
    if (!v.trim()) return true
    try {
      const parsed = JSON.parse(v)
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    } catch {
      return false
    }
  }, 'Enter a JSON object, e.g. {"store_id": "123"}'),
})
type FormValues = z.infer<typeof schema>

function valuesFor(carrier: Carrier | null): FormValues {
  return {
    name: carrier?.name ?? "",
    code: (carrier?.code as CarrierProvider) ?? "manual",
    phone: carrier?.phone ?? "",
    contact_email: carrier?.contact_email ?? "",
    api_base_url: carrier?.api_base_url ?? "",
    api_key: "",
    api_secret: "",
    webhook_secret: "",
    is_integration_enabled: carrier?.is_integration_enabled ?? false,
    is_active: carrier?.is_active ?? true,
    config: "",
  }
}

interface CarrierFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Carrier being edited, or null to create one. */
  carrier: Carrier | null
  onSaved: () => void
}

export function CarrierFormDialog({ open, onOpenChange, carrier, onSaved }: CarrierFormDialogProps) {
  const dispatch = useAppDispatch()
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: valuesFor(carrier) })

  useEffect(() => {
    if (open) reset(valuesFor(carrier))
  }, [open, carrier, reset])

  const onSubmit = async (values: FormValues) => {
    const payload: CarrierPayload = {
      name: values.name.trim(),
      code: values.code,
      phone: values.phone.trim(),
      contact_email: values.contact_email.trim(),
      api_base_url: values.api_base_url.trim(),
      is_integration_enabled: values.is_integration_enabled,
    }
    // Secrets are write-only: blank means "keep what's stored", so only send typed values.
    if (values.api_key) payload.api_key = values.api_key
    if (values.api_secret) payload.api_secret = values.api_secret
    if (values.webhook_secret) payload.webhook_secret = values.webhook_secret
    if (values.config.trim()) payload.config = JSON.parse(values.config)
    if (carrier) payload.is_active = values.is_active

    try {
      if (carrier) {
        await dispatch(updateCarrier({ id: carrier.id, payload })).unwrap()
        toast.success(`${payload.name} updated`)
      } else {
        await dispatch(createCarrier(payload)).unwrap()
        toast.success(`${payload.name} added`)
      }
      onOpenChange(false)
      onSaved()
    } catch (err) {
      for (const [field, message] of Object.entries(getApiFieldErrors(err))) {
        if (field in schema.shape) setError(field as keyof FormValues, { message })
      }
      toast.error(getApiErrorMessage(err, "Failed to save carrier"))
    }
  }

  const secretHint = (stored: boolean) => (carrier && stored ? "Stored — leave blank to keep" : "Not set")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{carrier ? `Edit ${carrier.name}` : "Add carrier"}</DialogTitle>
          <DialogDescription>
            Courier credentials are write-only — they are never shown again once saved.
          </DialogDescription>
        </DialogHeader>

        <form id="carrier-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="carrier-name">Name *</FieldLabel>
              <FieldContent>
                <Input id="carrier-name" aria-invalid={!!errors.name} {...register("name")} />
                <FieldError errors={[errors.name]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="carrier-code">Provider</FieldLabel>
              <FieldContent>
                <Controller
                  control={control}
                  name="code"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="carrier-code">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CARRIER_PROVIDER_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="carrier-phone">Phone</FieldLabel>
              <FieldContent>
                <Input id="carrier-phone" {...register("phone")} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="carrier-email">Contact email</FieldLabel>
              <FieldContent>
                <Input id="carrier-email" aria-invalid={!!errors.contact_email} {...register("contact_email")} />
                <FieldError errors={[errors.contact_email]} />
              </FieldContent>
            </Field>
          </div>

          <div className="space-y-4 rounded-lg border p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Courier integration</p>
            <Field>
              <FieldLabel htmlFor="carrier-url">API base URL</FieldLabel>
              <FieldContent>
                <Input id="carrier-url" placeholder="https://api.courier.example" {...register("api_base_url")} />
              </FieldContent>
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="carrier-key">API key</FieldLabel>
                <FieldContent>
                  <Input
                    id="carrier-key"
                    type="password"
                    autoComplete="new-password"
                    placeholder={secretHint(!!carrier?.has_api_key)}
                    {...register("api_key")}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="carrier-secret">API secret</FieldLabel>
                <FieldContent>
                  <Input
                    id="carrier-secret"
                    type="password"
                    autoComplete="new-password"
                    placeholder={carrier ? "Leave blank to keep" : ""}
                    {...register("api_secret")}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="carrier-webhook">Webhook secret</FieldLabel>
                <FieldContent>
                  <Input
                    id="carrier-webhook"
                    type="password"
                    autoComplete="new-password"
                    placeholder={carrier ? "Leave blank to keep" : ""}
                    {...register("webhook_secret")}
                  />
                </FieldContent>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="carrier-config">Config (JSON)</FieldLabel>
              <FieldContent>
                <Textarea
                  id="carrier-config"
                  rows={3}
                  className="font-mono text-xs"
                  placeholder={'{"store_id": "...", "merchant_password": "..."}'}
                  aria-invalid={!!errors.config}
                  {...register("config")}
                />
                <FieldDescription>
                  {carrier?.config_keys.length
                    ? `Stored keys: ${carrier.config_keys.join(", ")}. Saving a value here replaces the whole config.`
                    : "Provider-specific settings. Values are never read back."}
                </FieldDescription>
                <FieldError errors={[errors.config]} />
              </FieldContent>
            </Field>
            <Controller
              control={control}
              name="is_integration_enabled"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="carrier-integration">Live integration</FieldLabel>
                    <FieldDescription>Book consignments through the courier's API on dispatch.</FieldDescription>
                  </FieldContent>
                  <Switch id="carrier-integration" checked={field.value} onCheckedChange={field.onChange} />
                </Field>
              )}
            />
          </div>

          {carrier && (
            <Controller
              control={control}
              name="is_active"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="carrier-active">Active</FieldLabel>
                    <FieldDescription>Inactive carriers aren't offered for new shipments.</FieldDescription>
                  </FieldContent>
                  <Switch id="carrier-active" checked={field.value} onCheckedChange={field.onChange} />
                </Field>
              )}
            />
          )}
        </form>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="carrier-form" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {carrier ? "Save changes" : "Add carrier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
