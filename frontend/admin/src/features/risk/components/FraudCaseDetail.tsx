import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, CheckCircle2, Loader2, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DetailPageState } from "@/components/common/DetailPageState"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchSingle, resolveFraudCase } from "@/features/risk/slices/fraudCaseSlice"
import { selectFraudCases } from "@/features/risk/selectors"
import type { FraudCase } from "@/features/risk/types"
import { useCan } from "@/features/system/permissions"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { resolveDetailState } from "@/lib/detailState"
import { formatDateTime, humanize } from "@/lib/format"
import { fraudStatusTone } from "./fraudStatus"

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="text-sm font-medium">{children}</dd>
  </div>
)

const FraudCaseDetail = () => {
  const { id = "" } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const can = useCan()
  const canManage = can("risk.manage")
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

  const pageState = resolveDetailState(singleStatus, singleError, !!fraudCase)
  if (pageState || !fraudCase) {
    return (
      <DetailPageState
        state={pageState ?? "loading"}
        entity="Fraud case"
        backTo="/fraud_cases"
        backLabel="Back to Fraud Cases"
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
      <div className="flex items-center gap-4">
        <Button variant="back" size="icon" onClick={() => navigate("/fraud_cases")} aria-label="Back to fraud cases">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl md:text-3xl font-bold tracking-tight">
            {fraudCase.case_number}
            <StatusBadge status={fraudCase.status} tone={fraudStatusTone[fraudCase.status]} label={humanize(fraudCase.status)} />
          </h1>
          <p className="text-muted-foreground text-sm">Opened {formatDateTime(fraudCase.created_at)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle level={2} className="flex items-center gap-2 text-lg">
              <ShieldAlert className="h-5 w-5 text-primary" /> Case
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap text-sm">{fraudCase.description}</p>
            <dl className="space-y-3">
              <Row label="Order">
                {fraudCase.order_id ? (
                  <Link className="text-primary hover:underline" to={`/order_detail/${fraudCase.order_id}`}>
                    View order
                  </Link>
                ) : (
                  "—"
                )}
              </Row>
              <Row label="Customer">
                {fraudCase.customer_id ? (
                  can("*") ? (
                    <Link className="text-primary hover:underline" to={`/customer_detail/${fraudCase.customer_id}`}>
                      View customer
                    </Link>
                  ) : (
                    <span className="font-mono text-xs">{fraudCase.customer_id}</span>
                  )
                ) : (
                  "—"
                )}
              </Row>
            </dl>
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
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Resolve case
                </Button>
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
