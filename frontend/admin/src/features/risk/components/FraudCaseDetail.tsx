import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { CheckCircle2, ShieldAlert } from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DetailPageState } from "@/components/common/DetailPageState"
import { DetailRow } from "@/components/common/DetailRow"
import { PageHeader } from "@/components/common/PageHeader"
import { StatusBadge } from "@/components/common/StatusBadge"
import { SubmitButton } from "@/components/common/FormActions"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchSingle, resolveFraudCase } from "@/features/risk/slices/fraudCaseSlice"
import { selectFraudCases } from "@/features/risk/selectors"
import type { FraudCase } from "@/features/risk/types"
import { ADMIN_ONLY } from "@/features/system/permissions"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useKind, withKind } from "@/hooks/use-kind"
import { getApiErrorMessage } from "@/lib/api/client"
import { resolveDetailState } from "@/lib/detailState"
import { formatDateTime, humanize } from "@/lib/format"
import { fraudStatusTone } from "./fraudStatus"

const FraudCaseDetail = () => {
  const { id = "" } = useParams<{ id: string }>()
  const dispatch = useAppDispatch()
  const canManage = useCan("risk.manage")
  const canViewCustomers = useCan(ADMIN_ONLY)
  const { singleData, singleStatus, singleError } = useAppSelector(selectFraudCases)
  const fraudCase = singleData && (singleData as FraudCase).id === id ? (singleData as FraudCase) : null
  useDocumentTitle(fraudCase ? `${fraudCase.case_number} — Fraud Case` : "Fraud Case")

  const [resolution, setResolution] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const loadCase = useCallback(() => dispatch(fetchSingle(id)), [dispatch, id])

  useEffect(() => {
    const request = loadCase()
    return () => request.abort()
  }, [loadCase])

  const navigate = useNavigate()
  const base = useKind() === "preorder" ? "/preorder_fraud_cases" : "/fraud_cases"
  const kind = fraudCase?.order_type ?? "stock"
  const isPreorder = kind === "preorder"
  // A case opened under the other half's address moves to its own.
  const ownBase = !fraudCase ? base : isPreorder ? "/preorder_fraud_cases" : "/fraud_cases"
  useEffect(() => {
    if (ownBase !== base) navigate(`${ownBase}/${id}`, { replace: true })
  }, [ownBase, base, id, navigate])

  const pageState = resolveDetailState(singleStatus, singleError, !!fraudCase)
  if (pageState || !fraudCase || ownBase !== base) {
    return (
      <DetailPageState
        state={pageState ?? "loading"}
        entity="Fraud case"
        backTo={base}
        backLabel="Back to fraud cases"
        error={singleError}
        onRetry={loadCase}
      />
    )
  }

  const handleResolve = async (e: FormEvent) => {
    e.preventDefault()
    if (!resolution.trim()) return setError("Describe the outcome.")
    setError(null)
    setSaving(true)
    try {
      await dispatch(
        resolveFraudCase({ id: fraudCase.id, payload: { resolution: resolution.trim(), resolution_notes: notes.trim() } })
      ).unwrap()
      toast.success(`${fraudCase.case_number} resolved`)
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't resolve this case."))
    } finally {
      setSaving(false)
    }
  }

  const isResolved = fraudCase.status === "resolved"

  return (
    <div className="section-container space-y-6">
      <PageHeader
        title={fraudCase.case_number}
        description={`Opened ${formatDateTime(fraudCase.created_at)}`}
        back={{ to: base, label: "Back to fraud cases" }}
        badges={
          <StatusBadge status={fraudCase.status} tone={fraudStatusTone[fraudCase.status]} label={humanize(fraudCase.status)} />
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle level={2} className="flex items-center gap-2 text-lg">
              <ShieldAlert className="h-5 w-5 text-primary" /> Case
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap text-sm">{fraudCase.description}</p>
            <div>
              <DetailRow label={isPreorder ? "Pre-order" : "Order"}>
                {fraudCase.order_id ? (
                  <Link className="text-primary hover:underline" to={withKind(`/order_detail/${fraudCase.order_id}`, kind)}>
                    {isPreorder ? "View pre-order" : "View order"}
                  </Link>
                ) : (
                  "—"
                )}
              </DetailRow>
              <DetailRow label="Customer">
                {fraudCase.customer_id ? (
                  canViewCustomers ? (
                    <Link className="text-primary hover:underline" to={`/customer_detail/${fraudCase.customer_id}`}>
                      View customer
                    </Link>
                  ) : (
                    <span className="font-mono text-xs">{fraudCase.customer_id}</span>
                  )
                ) : (
                  "—"
                )}
              </DetailRow>
            </div>
          </CardContent>
        </Card>

        {isResolved ? (
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle level={2} className="flex items-center gap-2 text-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" /> Resolution
              </CardTitle>
              <CardDescription>Resolved {formatDateTime(fraudCase.resolved_at)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="font-medium">{fraudCase.resolution}</p>
              {fraudCase.resolution_notes && (
                <p className="whitespace-pre-wrap text-muted-foreground">{fraudCase.resolution_notes}</p>
              )}
            </CardContent>
          </Card>
        ) : canManage ? (
          <form onSubmit={handleResolve}>
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle level={2} className="text-lg">Resolve case</CardTitle>
                <CardDescription>Record what was decided. Resolving closes the case.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fraud-resolution">Outcome</Label>
                  <Input
                    id="fraud-resolution"
                    placeholder="e.g. Confirmed fraud — order cancelled"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fraud-notes">Notes (optional)</Label>
                  <Textarea id="fraud-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
              </CardContent>
              <CardFooter className="justify-end border-t p-4">
                <SubmitButton loading={saving} icon={CheckCircle2}>
                  Resolve case
                </SubmitButton>
              </CardFooter>
            </Card>
          </form>
        ) : (
          <Card className="border-none shadow-sm">
            <CardContent className="p-6 text-sm text-muted-foreground">
              This case is still open. Someone with risk management access can resolve it.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export default FraudCaseDetail
