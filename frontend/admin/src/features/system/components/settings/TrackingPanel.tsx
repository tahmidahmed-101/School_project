import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { AlertTriangle, BarChart3, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { SwitchField } from "@/components/common/FormDialog"
import { SubmitButton } from "@/components/common/FormActions"
import { TextField } from "@/components/common/form-fields"
import { StatusBadge } from "@/components/common/StatusBadge"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { formatDate } from "@/lib/format"

import { fetchConversionProviders, removeConversionProvider, saveConversionProvider } from "../../api"
import type { ConversionProvider, ConversionProviderKey, ConversionProviderPayload } from "../../types"
import { SectionState } from "./SectionState"

// What each provider calls its two values, and where to find them.
const COPY: Record<
  ConversionProviderKey,
  { idLabel: string; idPlaceholder: string; secretLabel: string; secretHelp: string; about: string }
> = {
  ga4: {
    idLabel: "Measurement ID",
    idPlaceholder: "G-XXXXXXXXXX",
    secretLabel: "Measurement Protocol API secret",
    secretHelp: "GA4 → Admin → Data streams → your web stream → Measurement Protocol API secrets → Create.",
    about: "Sends each confirmed order to Google Analytics 4 as a purchase, with its value and items.",
  },
  meta: {
    idLabel: "Pixel ID",
    idPlaceholder: "123456789012345",
    secretLabel: "Conversions API access token",
    secretHelp: "Events Manager → your pixel → Settings → Conversions API → Generate access token.",
    about: "Sends each confirmed order to Meta (Facebook / Instagram ads) as a Purchase, so ads can optimise for sales.",
  },
  tiktok: {
    idLabel: "Pixel ID",
    idPlaceholder: "C4ABCDEF123456",
    secretLabel: "Events API access token",
    secretHelp: "TikTok Ads Manager → Events → your web pixel → Settings → Events API → Generate access token.",
    about: "Sends each confirmed order to TikTok as a CompletePayment, so TikTok ads can optimise for sales.",
  },
}

// Server-side Purchase tracking: the backend tells GA4, Meta and TikTok about each confirmed order.
export function TrackingPanel({ canManage }: { canManage: boolean }) {
  const [providers, setProviders] = useState<ConversionProvider[] | null>(null)
  const [status, setStatus] = useState<"loading" | "succeeded" | "failed">("loading")
  const [error, setError] = useState<unknown>(null)

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchConversionProviders().then(
      (data) => {
        if (cancelled) return
        setProviders(data)
        setStatus("succeeded")
      },
      (err) => {
        if (cancelled) return
        setError(err)
        setStatus("failed")
      }
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = () => {
    setStatus("loading")
    setAttempt((n) => n + 1)
  }

  if (!providers) {
    return <SectionState status={status} error={error} hasData={false} onRetry={retry} label="tracking settings" />
  }

  const replace = (next: ConversionProvider) =>
    setProviders((current) => current?.map((p) => (p.provider === next.provider ? next : p)) ?? null)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" /> Purchase tracking
          </CardTitle>
          <CardDescription>
            When an order is confirmed, the server sends a Purchase event to the services connected below. No customer
            name, email, phone or address is sent; the shopper's browser ids, IP address and browser name are, so the
            ad platforms can match the sale to the ad. Page views and cart events come from the storefront's own
            Google Analytics, Meta Pixel and TikTok Pixel tags.
          </CardDescription>
        </CardHeader>
      </Card>
      {providers.map((provider) => (
        <ProviderCard key={provider.provider} provider={provider} canManage={canManage} onSaved={replace} />
      ))}
    </div>
  )
}

interface FormValues {
  tracking_id: string
  secret: string
  test_event_code: string
  is_enabled: boolean
}

const formFrom = (p: ConversionProvider): FormValues => ({
  tracking_id: p.source === "dashboard" ? p.tracking_id : "",
  secret: "",
  test_event_code: p.source === "dashboard" ? p.test_event_code : "",
  is_enabled: p.source === "dashboard" ? p.is_enabled : true,
})

function ProviderCard({
  provider,
  canManage,
  onSaved,
}: {
  provider: ConversionProvider
  canManage: boolean
  onSaved: (provider: ConversionProvider) => void
}) {
  const copy = COPY[provider.provider]
  const saved = provider.source === "dashboard"
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isDirty, isSubmitting, dirtyFields },
  } = useForm<FormValues>({ defaultValues: formFrom(provider) })
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    reset(formFrom(provider))
  }, [provider, reset])

  const onSubmit = async (values: FormValues) => {
    const payload: ConversionProviderPayload = {}
    if (!saved || dirtyFields.tracking_id) payload.tracking_id = values.tracking_id.trim()
    if (values.secret.trim()) payload.secret = values.secret.trim()
    if (provider.provider !== "ga4" && (!saved || dirtyFields.test_event_code)) {
      payload.test_event_code = values.test_event_code.trim()
    }
    if (saved && dirtyFields.is_enabled) payload.is_enabled = values.is_enabled
    try {
      onSaved(await saveConversionProvider(provider.provider, payload))
      toast.success(`${provider.label} tracking saved`)
    } catch (err) {
      const fieldErrors = getApiFieldErrors(err)
      let placed = false
      for (const field of ["tracking_id", "secret", "test_event_code"] as const) {
        if (fieldErrors[field]) {
          setError(field, { message: fieldErrors[field] })
          placed = true
        }
      }
      if (!placed) toast.error(getApiErrorMessage(err, `Couldn't save ${provider.label} tracking`))
    }
  }

  const remove = async () => {
    setRemoving(true)
    try {
      onSaved(await removeConversionProvider(provider.provider))
      toast.success(`${provider.label} settings removed`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, `Couldn't remove ${provider.label} settings`))
    } finally {
      setRemoving(false)
    }
  }

  const sourceText =
    provider.source === "dashboard"
      ? "Using the settings saved here."
      : provider.source === "environment"
        ? `Using the server's environment settings (${provider.tracking_id}). Saving here takes over.`
        : "Not connected."

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {provider.label}
          <StatusBadge
            status={provider.is_active ? "active" : "inactive"}
            label={provider.is_active ? "Sending purchases" : "Off"}
          />
        </CardTitle>
        <CardDescription>
          {copy.about} {sourceText}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!provider.encryption_available && (
          <p className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            The secret can't be saved yet: the server needs <code className="font-mono">SECRETS_ENCRYPTION_KEYS</code>{" "}
            set in its environment.
          </p>
        )}
        {saved && provider.secret_status === "unreadable" && (
          <p className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            The saved secret can't be read with the server's current key, so nothing is being sent. Enter it again.
          </p>
        )}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label={copy.idLabel}
              placeholder={copy.idPlaceholder}
              disabled={!canManage}
              error={errors.tracking_id}
              {...register("tracking_id", { required: `Enter the ${copy.idLabel}` })}
            />
            <TextField
              label={copy.secretLabel}
              type="password"
              autoComplete="new-password"
              placeholder={saved && provider.secret_status === "set" ? "••••••••" : ""}
              description={
                saved && provider.secret_status === "set"
                  ? `Saved${provider.secret_updated_at ? ` ${formatDate(provider.secret_updated_at)}` : ""}. Leave empty to keep it.`
                  : copy.secretHelp
              }
              disabled={!canManage}
              error={errors.secret}
              {...register("secret", {
                validate: (value) => saved || value.trim() !== "" || `Enter the ${copy.secretLabel}`,
              })}
            />
            {provider.provider !== "ga4" && (
              <TextField
                label="Test event code (optional)"
                placeholder="TEST12345"
                description={`From ${provider.label} Events Manager → Test events. While set, purchases show there instead of counting. Clear it when you're done testing.`}
                disabled={!canManage}
                error={errors.test_event_code}
                {...register("test_event_code")}
              />
            )}
          </div>
          {saved && (
            <SwitchField
              control={control}
              name="is_enabled"
              label="Send purchases"
              description="Off stops sending without deleting what is saved here."
              disabled={!canManage}
            />
          )}
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <SubmitButton loading={isSubmitting} icon={Save} disabled={!isDirty}>
                {saved ? "Save changes" : `Connect ${provider.label}`}
              </SubmitButton>
              {saved && (
                <ConfirmDialog
                  destructive
                  title={`Remove the saved ${provider.label} settings?`}
                  description={
                    provider.environment_configured
                      ? "The server's environment settings take over again."
                      : `${provider.label} stops receiving purchases.`
                  }
                  confirmLabel="Remove"
                  onConfirm={remove}
                  trigger={
                    <Button type="button" variant="outline" className="text-destructive" disabled={removing}>
                      <Trash2 className="size-4" /> Remove
                    </Button>
                  }
                />
              )}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
