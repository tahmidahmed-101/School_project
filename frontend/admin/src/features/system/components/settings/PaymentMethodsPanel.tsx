import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchPaymentMethods, updatePaymentMethod } from "@/features/system/slices/businessSettingsSlice"
import { getApiErrorMessage } from "@/lib/api/client"
import { SectionState } from "./SectionState"

export function PaymentMethodsPanel({ canManage }: { canManage: boolean }) {
  const dispatch = useAppDispatch()
  const { data, status, error } = useAppSelector((state) => state.businessSettings.paymentMethods)
  const [saving, setSaving] = useState<string | null>(null)

  if (!data.length) {
    return (
      <SectionState
        status={status}
        error={error}
        hasData={status === "succeeded"}
        onRetry={() => dispatch(fetchPaymentMethods())}
        label="payment methods"
      />
    )
  }

  const toggle = async (key: string, label: string, is_enabled: boolean) => {
    setSaving(key)
    try {
      await dispatch(updatePaymentMethod({ key, is_enabled })).unwrap()
      toast.success(`${label} ${is_enabled ? "enabled" : "disabled"}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, `Couldn't update ${label}`))
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Methods</CardTitle>
        <CardDescription>Methods switched off can't be chosen at checkout or when recording a payment.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {data.map((method, index) => {
          const locked = method.is_enabled && !method.can_disable
          return (
            <div key={method.key}>
              {index > 0 && <Separator />}
              <div className="flex items-start justify-between gap-4 px-6 py-4">
                <div className="space-y-0.5">
                  <label htmlFor={`pm-${method.key}`} className="text-sm font-medium">
                    {method.label}
                  </label>
                  <p className="text-sm text-muted-foreground">{method.description}</p>
                  {locked && method.locked_reason && (
                    <p className="text-xs text-amber-600 dark:text-amber-500">{method.locked_reason}</p>
                  )}
                </div>
                <Switch
                  id={`pm-${method.key}`}
                  checked={method.is_enabled}
                  disabled={!canManage || locked || saving === method.key}
                  onCheckedChange={(checked) => toggle(method.key, method.label, checked)}
                />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
