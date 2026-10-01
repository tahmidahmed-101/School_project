import { MessageSquare } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchIntegrations } from "@/features/system/slices/businessSettingsSlice"
import { SectionState } from "./SectionState"

/** Read-only: SMS credentials live in the server environment, not the database. */
export function IntegrationsPanel() {
  const dispatch = useAppDispatch()
  const { data, status, error } = useAppSelector((state) => state.businessSettings.integrations)

  if (!data) {
    return (
      <SectionState
        status={status}
        error={error}
        hasData={false}
        onRetry={() => dispatch(fetchIntegrations())}
        label="integrations"
      />
    )
  }

  const { sms } = data
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" /> SMS
        </CardTitle>
        <CardDescription>
          Order and verification texts. Credentials are set in the server environment by your administrator and can't be
          changed here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Provider</dt>
            <dd className="mt-1 font-medium">{sms.provider}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="mt-1">
              <StatusBadge
                status={sms.is_configured ? "active" : "inactive"}
                label={sms.is_configured ? "Connected" : "Not configured"}
              />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sender number</dt>
            <dd className="mt-1 font-mono">{sms.from_number || "—"}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}
