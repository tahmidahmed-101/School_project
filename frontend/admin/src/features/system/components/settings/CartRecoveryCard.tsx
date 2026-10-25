import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchBusinessProfile, updateBusinessProfile } from "@/features/system/slices/businessSettingsSlice"
import { getApiErrorMessage } from "@/lib/api/client"
import { SectionState } from "./SectionState"

export function CartRecoveryCard({ canManage }: { canManage: boolean }) {
  const dispatch = useAppDispatch()
  const { data: profile, status, error } = useAppSelector((state) => state.businessSettings.profile)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const request = dispatch(fetchBusinessProfile())
    return () => request.abort()
  }, [dispatch])

  if (!profile) {
    return (
      <SectionState
        status={status}
        error={error}
        hasData={false}
        onRetry={() => dispatch(fetchBusinessProfile())}
        label="the cart reminder setting"
      />
    )
  }

  const toggle = async (enabled: boolean) => {
    setSaving(true)
    try {
      await dispatch(updateBusinessProfile({ cart_recovery_enabled: enabled })).unwrap()
      toast.success(enabled ? "Cart reminders are on" : "Cart reminders are off")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't save the cart reminder setting"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Cart reminders</CardTitle>
        <CardDescription>
          One text to a shopper who left items in the cart for a few hours and has not ordered since. Never sent twice
          for one cart.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Switch
            id="cart-recovery-enabled"
            checked={profile.cart_recovery_enabled}
            disabled={!canManage || saving}
            onCheckedChange={toggle}
          />
          <label htmlFor="cart-recovery-enabled" className="text-sm">
            Send cart reminder texts
          </label>
        </div>
      </CardContent>
    </Card>
  )
}
