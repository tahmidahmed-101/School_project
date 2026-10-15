import { useEffect, useState } from "react"
import { Link2, Unlink } from "lucide-react"
import { toast } from "sonner"
import { api, getApiErrorMessage } from "@/lib/api/client"
import { unwrapEnvelope } from "@/lib/api/envelope"
import { formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { SubmitButton } from "@/components/common/FormActions"

const ENDPOINT = "/admin/staff/telegram-link/"

/** GET /admin/staff/telegram-link/ — whether this account is linked to a Telegram account. */
interface TelegramLinkStatus {
  linked: boolean
  linked_at: string | null
}

/** POST /admin/staff/telegram-link/ — a single-use code, shown once. */
interface TelegramLinkCode {
  code: string
  expires_in_minutes: number
}

/** Links the signed-in staff member's own Telegram account to the shop's bot. */
export function TelegramLinkCard() {
  const [status, setStatus] = useState<TelegramLinkStatus | null>(null)
  const [code, setCode] = useState<TelegramLinkCode | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () =>
    api
      .get(ENDPOINT)
      .then((res) => setStatus(unwrapEnvelope<TelegramLinkStatus>(res.data)))
      .catch((err) => toast.error(getApiErrorMessage(err, "Couldn't load the Telegram link.")))

  useEffect(() => {
    void refresh()
  }, [])

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true)
    try {
      await action()
    } catch (err) {
      toast.error(getApiErrorMessage(err, failure))
    } finally {
      setBusy(false)
    }
  }

  const handleGenerate = () =>
    run(async () => {
      const res = await api.post(ENDPOINT)
      setCode(unwrapEnvelope<TelegramLinkCode>(res.data))
    }, "Couldn't create a code.")

  const handleUnlink = () =>
    run(async () => {
      await api.delete(ENDPOINT)
      setCode(null)
      await refresh()
      toast.success("Telegram unlinked")
    }, "Couldn't unlink Telegram.")

  return (
    <Card>
      <CardHeader>
        <CardTitle>Telegram</CardTitle>
        <CardDescription>
          Link your own Telegram account to get order alerts and use the shop bot. Alerts arrive in your private chat
          with the bot.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          {status === null
            ? "Checking…"
            : status.linked
              ? `Linked${status.linked_at ? ` since ${formatDateTime(status.linked_at)}` : ""}.`
              : "Not linked."}
        </p>
        {code && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p>Open the shop bot in Telegram and send it this message:</p>
            <p className="mt-2 select-all font-mono text-base font-semibold">/start {code.code}</p>
            <p className="mt-2 text-muted-foreground">
              The code works once and expires in {code.expires_in_minutes} minutes. It is not shown again.
            </p>
            <Button variant="outline" size="action" className="mt-3" onClick={() => void refresh()}>
              I've sent it
            </Button>
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-end gap-2 border-t p-4">
        {status?.linked && (
          <Button variant="outline" onClick={handleUnlink} disabled={busy}>
            <Unlink className="size-4" /> Unlink
          </Button>
        )}
        <SubmitButton type="button" loading={busy} icon={Link2} onClick={handleGenerate}>
          {status?.linked ? "Link a different account" : "Get a link code"}
        </SubmitButton>
      </CardFooter>
    </Card>
  )
}
