import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchPaymentMethods, updatePaymentMethod } from "@/features/system/slices/businessSettingsSlice"
import type { Kind } from "@/hooks/use-kind"
import { getApiErrorMessage } from "@/lib/api/client"
import { SectionState } from "./SectionState"

// The methods the storefront checkout offers that are paid to a shop number.
const PAY_TO_METHODS = new Set(["bkash", "nagad"])

export function PaymentMethodsPanel({ canManage, kind }: { canManage: boolean; kind: Kind }) {
  const dispatch = useAppDispatch()
  const { data: loaded, status, error } = useAppSelector((state) => state.businessSettings.paymentMethods)
  const [saving, setSaving] = useState<string | null>(null)
  const data = loaded.filter((method) => method.kind === kind)

  if (!data.length) {
    return (
      <SectionState
        status={status}
        error={error}
        hasData={false}
        onRetry={() => dispatch(fetchPaymentMethods(kind))}
        label="payment methods"
      />
    )
  }

  const toggle = async (key: string, label: string, is_enabled: boolean) => {
    setSaving(key)
    try {
      await dispatch(updatePaymentMethod({ key, kind, is_enabled })).unwrap()
      toast.success(`${label} ${is_enabled ? "enabled" : "disabled"}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, `Couldn't update ${label}`))
    } finally {
      setSaving(null)
    }
  }

  const savePayTo = async (key: string, label: string, pay_to: string) => {
    try {
      await dispatch(updatePaymentMethod({ key, kind, pay_to })).unwrap()
      toast.success(`${label} number saved`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, `Couldn't update ${label}`))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{kind === "preorder" ? "Pre-order payment methods" : "Payment methods"}</CardTitle>
        <CardDescription>
          {kind === "preorder"
            ? "Methods switched off can't be chosen at a pre-order checkout or when recording a pre-order payment. Stock orders have their own list in Settings."
            : "Methods switched off can't be chosen at checkout or when recording a payment. Pre-orders have their own list in Pre-order Settings."}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {data.map((method, index) => {
          const locked = method.is_enabled && !method.can_disable
          return (
            <div key={method.key}>
              {index > 0 && <Separator />}
              <div className="flex items-start justify-between gap-4 px-6 py-4">
                <div className="space-y-0.5">
                  <label htmlFor={`pm-${kind}-${method.key}`} className="text-sm font-medium">
                    {method.label}
                  </label>
                  <p className="text-sm text-muted-foreground">{method.description}</p>
                  {locked && method.locked_reason && (
                    <p className="text-xs text-amber-600 dark:text-amber-500">{method.locked_reason}</p>
                  )}
                  {PAY_TO_METHODS.has(method.key) && (
                    <Input
                      key={method.pay_to}
                      aria-label={`${method.label} number or account shown to customers`}
                      placeholder="Number or account shown to customers"
                      defaultValue={method.pay_to}
                      disabled={!canManage}
                      className="mt-2 max-w-xs"
                      onBlur={(event) => {
                        const value = event.target.value.trim()
                        if (value !== method.pay_to) void savePayTo(method.key, method.label, value)
                      }}
                    />
                  )}
                </div>
                <Switch
                  id={`pm-${kind}-${method.key}`}
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
