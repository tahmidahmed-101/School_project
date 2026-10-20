import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { AlertTriangle, Mail, Save, Send, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { SwitchField } from "@/components/common/FormDialog"
import { SubmitButton } from "@/components/common/FormActions"
import { SelectField, TextField } from "@/components/common/form-fields"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useAppSelector } from "@/app/hooks"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { formatDate, formatDateTime } from "@/lib/format"
import type { Option } from "@/lib/types"

import { fetchEmailSettings, removeEmailSettings, saveEmailSettings, sendTestEmail } from "../../api"
import type { EmailSettings, EmailSettingsPayload, SmtpSecurity } from "../../types"
import { SectionState } from "./SectionState"

// The ports and security modes AdminEmailSettingsUpdateSerializer accepts.
const PORT_OPTIONS: Option[] = [
  { label: "587 (STARTTLS, most providers)", value: "587" },
  { label: "465 (SSL)", value: "465" },
  { label: "2525", value: "2525" },
  { label: "25", value: "25" },
]
const SECURITY_OPTIONS: Option[] = [
  { label: "STARTTLS", value: "starttls" },
  { label: "SSL / TLS", value: "ssl" },
  { label: "None (no login allowed)", value: "none" },
]

// send_test_email's fixed reason codes, in words staff can act on.
const TEST_REASONS: Record<string, string> = {
  auth_failed: "The mail server refused the username or password.",
  connection_failed: "Couldn't connect to the mail server. Check the host and port.",
  timeout: "The mail server didn't answer in time.",
  tls_failed: "The secure connection failed. Check the security setting matches the port.",
  recipient_refused: "The mail server refused the recipient address.",
  sender_refused: "The mail server refused the sender address. Use an address your account may send from.",
  host_not_allowed: "That host points to a private or internal address and can't be used.",
  rejected: "The mail server rejected the message.",
}

interface FormValues {
  host: string
  port: string
  security: SmtpSecurity
  username: string
  password: string
  from_name: string
  from_email: string
  is_enabled: boolean
}

const EMPTY: FormValues = {
  host: "",
  port: "587",
  security: "starttls",
  username: "",
  password: "",
  from_name: "",
  from_email: "",
  is_enabled: true,
}

function formFrom(settings: EmailSettings): FormValues {
  const saved = settings.dashboard
  if (!saved) return EMPTY
  return {
    host: saved.host,
    port: String(saved.port),
    security: saved.security,
    username: saved.username,
    password: "",
    from_name: saved.from_name,
    from_email: saved.from_email,
    is_enabled: saved.is_enabled,
  }
}

/**
 * The SMTP server that sends password reset and verification emails. A server saved here
 * takes over from the one in the server's environment; removing it hands mail back.
 */
export function EmailPanel({ canManage }: { canManage: boolean }) {
  const [settings, setSettings] = useState<EmailSettings | null>(null)
  const [status, setStatus] = useState<"loading" | "succeeded" | "failed">("loading")
  const [error, setError] = useState<unknown>(null)

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchEmailSettings().then(
      (data) => {
        if (cancelled) return
        setSettings(data)
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

  if (!settings) {
    return <SectionState status={status} error={error} hasData={false} onRetry={retry} label="email settings" />
  }

  return (
    <div className="space-y-4">
      <EmailStatusCard settings={settings} />
      <SmtpServerCard settings={settings} canManage={canManage} onSaved={setSettings} />
      {canManage && <TestEmailCard settings={settings} onSent={() => setAttempt((n) => n + 1)} />}
    </div>
  )
}

function EmailStatusCard({ settings }: { settings: EmailSettings }) {
  const { source, sends_real_email, environment, dashboard } = settings
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" /> Outgoing email
        </CardTitle>
        <CardDescription>
          Used for password reset and email verification codes. Order updates are not sent by email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="mt-1">
              <StatusBadge
                status={sends_real_email ? "active" : "inactive"}
                label={sends_real_email ? "Sending email" : "Not sending real email"}
              />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sent through</dt>
            <dd className="mt-1 font-medium">
              {source === "dashboard" ? "The server saved below" : "The server's environment settings"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Mail server</dt>
            <dd className="mt-1 font-mono">
              {source === "dashboard" && dashboard
                ? `${dashboard.host}:${dashboard.port}`
                : environment.host
                  ? `${environment.host}:${environment.port ?? ""}`
                  : "—"}
            </dd>
          </div>
        </dl>
        {!sends_real_email && (
          <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Emails are only written to the server log right now, so customers don't receive their codes. Save a mail
            server below to start sending.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function SmtpServerCard({
  settings,
  canManage,
  onSaved,
}: {
  settings: EmailSettings
  canManage: boolean
  onSaved: (settings: EmailSettings) => void
}) {
  const saved = settings.dashboard
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isDirty, isSubmitting, dirtyFields },
  } = useForm<FormValues>({ defaultValues: formFrom(settings) })
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    reset(formFrom(settings))
  }, [settings, reset])

  const onSubmit = async (values: FormValues) => {
    // The first save sends everything; later ones only what changed, so a kept password stays.
    const payload: EmailSettingsPayload = {}
    const changed = (field: keyof FormValues) => !saved || dirtyFields[field]
    if (changed("host")) payload.host = values.host.trim()
    if (changed("port")) payload.port = Number(values.port)
    if (changed("security")) payload.security = values.security
    if (changed("username")) payload.username = values.username.trim()
    if (values.password) payload.password = values.password
    if (changed("from_name")) payload.from_name = values.from_name.trim()
    if (changed("from_email")) payload.from_email = values.from_email.trim()
    if (saved && dirtyFields.is_enabled) payload.is_enabled = values.is_enabled
    try {
      onSaved(await saveEmailSettings(payload))
      toast.success("Mail server saved")
    } catch (err) {
      const fieldErrors = getApiFieldErrors(err)
      const fields = Object.keys(EMPTY) as (keyof FormValues)[]
      let placed = false
      for (const field of fields) {
        if (fieldErrors[field]) {
          setError(field, { message: fieldErrors[field] })
          placed = true
        }
      }
      if (!placed) toast.error(getApiErrorMessage(err, "Couldn't save the mail server"))
    }
  }

  const remove = async () => {
    setRemoving(true)
    try {
      onSaved(await removeEmailSettings())
      toast.success("Saved mail server removed — the server's environment settings apply again")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't remove the mail server"))
    } finally {
      setRemoving(false)
    }
  }

  const passwordHint =
    saved?.password_status === "set"
      ? `Saved${saved.password_updated_at ? ` ${formatDate(saved.password_updated_at)}` : ""}. Leave empty to keep it; enter it again if you change the host or username.`
      : saved?.password_status === "unreadable"
        ? "The saved password can't be read with the server's current key. Enter it again."
        : "For Gmail, use an app password, not your normal password."

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Mail server (SMTP)
          {saved && (
            <StatusBadge
              status={saved.is_active ? "active" : "inactive"}
              label={saved.is_active ? "In use" : saved.is_enabled ? "Incomplete" : "Turned off"}
            />
          )}
        </CardTitle>
        <CardDescription>
          The login details from your email provider (e.g. Gmail, Zoho, Brevo, Mailgun). Saving here overrides the
          server's environment settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!settings.encryption_available && (
          <p className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            A password can't be saved yet: the server needs <code className="font-mono">SECRETS_ENCRYPTION_KEYS</code>{" "}
            set in its environment. Ask whoever runs the server to add it.
          </p>
        )}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="Host"
              placeholder="smtp.gmail.com"
              disabled={!canManage}
              error={errors.host}
              {...register("host", { required: "Enter the mail server host" })}
            />
            <div className="grid grid-cols-2 gap-4">
              <SelectField control={control} name="port" label="Port" options={PORT_OPTIONS} disabled={!canManage} />
              <SelectField
                control={control}
                name="security"
                label="Security"
                options={SECURITY_OPTIONS}
                disabled={!canManage}
              />
            </div>
            <TextField
              label="Username"
              placeholder="you@gmail.com"
              autoComplete="off"
              disabled={!canManage}
              error={errors.username}
              {...register("username")}
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="new-password"
              placeholder={saved?.password_status === "set" ? "••••••••" : ""}
              description={passwordHint}
              disabled={!canManage}
              error={errors.password}
              {...register("password")}
            />
            <TextField
              label="Sender name"
              placeholder="Kull Mart"
              disabled={!canManage}
              error={errors.from_name}
              {...register("from_name")}
            />
            <TextField
              label="Sender email"
              type="email"
              placeholder="noreply@yourshop.com"
              disabled={!canManage}
              error={errors.from_email}
              {...register("from_email", { required: "Enter the address emails come from" })}
            />
          </div>
          {saved && (
            <SwitchField
              control={control}
              name="is_enabled"
              label="Use this server"
              description="Off hands email back to the server's environment settings without deleting what is saved here."
              disabled={!canManage}
            />
          )}
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <SubmitButton loading={isSubmitting} icon={Save} disabled={!isDirty}>
                {saved ? "Save changes" : "Save mail server"}
              </SubmitButton>
              {saved && (
                <ConfirmDialog
                  destructive
                  title="Remove the saved mail server?"
                  description="Email goes back to the server's environment settings. If those aren't set, codes are only written to the log."
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

function TestEmailCard({ settings, onSent }: { settings: EmailSettings; onSent: () => void }) {
  const ownEmail = useAppSelector((state) => state.auth.user?.email ?? "")
  const [recipient, setRecipient] = useState("")
  const [sending, setSending] = useState(false)
  const last = settings.dashboard

  const send = async () => {
    setSending(true)
    try {
      const result = await sendTestEmail(recipient.trim() || undefined)
      if (result.accepted) {
        toast.success(`Test email accepted for ${result.recipient}. Check the inbox (and spam folder).`)
      } else {
        toast.error(TEST_REASONS[result.reason] ?? "The mail server did not accept the test email.")
      }
      onSent()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't send the test email"))
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send a test email</CardTitle>
        <CardDescription>
          Sends through the server in use now. Up to 5 tests an hour. "Accepted" means the mail server took it, not
          that it reached the inbox.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <TextField
            label="Send to"
            type="email"
            className="w-full sm:max-w-sm"
            placeholder={ownEmail || "you@example.com"}
            description="Leave empty to send it to your own address."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />
          <Button type="button" onClick={send} disabled={sending} className="sm:mb-6">
            <Send className="size-4" /> {sending ? "Sending…" : "Send test"}
          </Button>
        </div>
        {last?.last_test_at && (
          <p className="text-sm text-muted-foreground">
            Last test {formatDateTime(last.last_test_at)}:{" "}
            {last.last_test_accepted
              ? "accepted by the mail server."
              : (TEST_REASONS[last.last_test_reason] ?? "not accepted.")}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
