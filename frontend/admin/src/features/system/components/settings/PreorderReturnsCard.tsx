import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchPolicies, updatePolicy } from "@/features/system/slices/businessSettingsSlice"
import type { StorePolicyUpdate } from "@/features/system/types"
import { getApiErrorMessage } from "@/lib/api/client"
import { SectionState } from "./SectionState"

/** The pre-order rule of the return policy; the rest of that policy is edited under Shop settings → Store policies. */
export function PreorderReturnsCard({ canManage }: { canManage: boolean }) {
  const dispatch = useAppDispatch()
  const { data: policies, status, error } = useAppSelector((state) => state.businessSettings.policies)
  const [saving, setSaving] = useState(false)
  const policy = policies.find((p) => p.kind === "returns")

  if (!policy?.return_rules) {
    if (status === "succeeded") return null
    return (
      <SectionState
        status={status}
        error={error}
        hasData={false}
        onRetry={() => dispatch(fetchPolicies())}
        label="the pre-order return rule"
      />
    )
  }

  const toggle = async (allowed: boolean) => {
    setSaving(true)
    // A change to published terms must restate the effective date (effective_date_required).
    const patch: StorePolicyUpdate = { preorder_returns_allowed: allowed }
    if (policy.is_published) patch.effective_date = policy.effective_date
    try {
      await dispatch(updatePolicy({ kind: "returns", patch })).unwrap()
      toast.success(allowed ? "Pre-ordered items can now be returned" : "Pre-ordered items can no longer be returned")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't save the pre-order return rule"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Returns</CardTitle>
        <CardDescription>
          Enforced when a return is requested, but only while the return policy is published.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Switch
            id="preorder-returns-allowed"
            checked={policy.return_rules.preorder_returns_allowed}
            disabled={!canManage || saving}
            onCheckedChange={toggle}
          />
          <label htmlFor="preorder-returns-allowed" className="text-sm">
            Pre-ordered items can be returned
          </label>
        </div>
      </CardContent>
    </Card>
  )
}
