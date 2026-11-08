import { useCallback, useEffect, useState, type ReactNode } from "react"
import { startOfYear } from "date-fns"
import { toast } from "sonner"
import { AlertCircle, CheckCircle2, DownloadIcon, Loader2, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/common/PageHeader"
import { api, extractApiError, getApiErrorMessage } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import { formatCurrency, formatDate, toISODate, todayLocalISODate } from "@/lib/format"
import { blobErrorToJson, saveBlob } from "@/lib/download"
import { cn } from "@/lib/utils"
import { useDocumentTitle } from "@/hooks/use-document-title"
import type { BalanceSheetReport, CashFlowReport, InventoryValuationReport, ProfitAndLossReport } from "../types"

const REPORTS = "/admin/accounting/reports/"
const yearStart = () => toISODate(startOfYear(new Date()))

/** Fetches one report whenever `params` change; `null` params means "inputs incomplete". */
function useReport<T>(path: string, params: Record<string, string> | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const key = params ? JSON.stringify(params) : null

  useEffect(() => {
    if (key === null) return
    const controller = new AbortController()
    const run = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const res = await api.get(`${REPORTS}${path}`, { params: JSON.parse(key), signal: controller.signal })
        setData(unwrapItem<T>(res.data))
      } catch (err) {
        if (!controller.signal.aborted) setError(extractApiError(err))
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }
    run()
    return () => controller.abort()
  }, [path, key, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  return { data, error, isLoading, reload }
}

async function downloadCsv(path: string, params: Record<string, string>, filename: string) {
  try {
    const res = await api.get(`${REPORTS}${path}`, {
      params: { ...params, file_format: "csv" },
      responseType: "blob",
    })
    saveBlob(res.data as Blob, filename)
  } catch (err) {
    toast.error(getApiErrorMessage(extractApiError(await blobErrorToJson(err)), "Failed to download CSV"))
  }
}

// ---- Statement building blocks -------------------------------------------------------------

function StatementLine({
  label,
  value,
  variant = "line",
  indent = false,
  hint,
}: {
  label: ReactNode
  value: number
  variant?: "line" | "subtotal" | "total"
  indent?: boolean
  hint?: ReactNode
}) {
  const negative = value < 0
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-2.5",
        variant === "line" && "border-b border-border/60",
        variant === "subtotal" && "border-b border-border font-semibold",
        variant === "total" && "border-t-2 border-double border-foreground/60 pt-3 text-base font-bold"
      )}
    >
      <div className={cn("min-w-0", indent && "pl-6")}>
        <span className={cn(variant === "line" ? "text-sm text-foreground" : "text-foreground")}>{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </div>
      <span
        className={cn(
          "tabular-nums whitespace-nowrap",
          variant === "line" && "text-sm",
          negative && "text-destructive"
        )}
      >
        {negative ? `(${formatCurrency(Math.abs(value))})` : formatCurrency(value)}
      </span>
    </div>
  )
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <p className="pt-5 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>
}

function ReportBody({
  isLoading,
  error,
  onRetry,
  hasData,
  children,
}: {
  isLoading: boolean
  error: unknown
  onRetry: () => void
  hasData: boolean
  children: ReactNode
}) {
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center" role="alert">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{getApiErrorMessage(error, "Couldn't load this report.")}</p>
        <Button variant="outline" onClick={onRetry}>
          <RotateCcw className="size-4" /> Try again
        </Button>
      </div>
    )
  }
  if (!hasData) {
    return (
      <div className="flex items-center justify-center py-16" role="status">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }
  return <div className={cn("transition-opacity", isLoading && "opacity-60")}>{children}</div>
}

function DateField({
  id,
  label,
  value,
  onChange,
  min,
  max,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  min?: string
  max?: string
}) {
  return (
    <div className="min-w-0 flex-1 space-y-1 sm:flex-none">
      <label htmlFor={id} className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="sm:w-[160px]"
      />
    </div>
  )
}

function ReportCard({
  title,
  description,
  controls,
  onDownload,
  children,
}: {
  title: string
  description: ReactNode
  controls?: ReactNode
  onDownload?: () => void
  children: ReactNode
}) {
  return (
    <Card className="max-w-3xl">
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {onDownload && (
            <Button variant="primary" size="action" onClick={onDownload}>
              <DownloadIcon className="size-4" /> CSV
            </Button>
          )}
        </div>
        {controls && <div className="flex flex-wrap items-end gap-3">{controls}</div>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

// ---- Reports -------------------------------------------------------------------------------

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-xs text-muted-foreground">{children}</p>
}

function ProfitAndLossBody({ params }: { params: Record<string, string> }) {
  const { data, error, isLoading, reload } = useReport<ProfitAndLossReport>("profit-and-loss/", params)
  const margin = data?.gross_margin_percent ?? null
  return (
    <ReportBody isLoading={isLoading} error={error} onRetry={reload} hasData={!!data}>
      {data && (
        <>
          <SectionHeading>Income</SectionHeading>
          <StatementLine label="Revenue" value={data.revenue} hint="Sales net of returns" />
          <StatementLine label="Cost of goods sold" value={-data.cost_of_goods_sold} indent />
          <StatementLine
            label="Gross profit"
            value={data.gross_profit}
            variant="subtotal"
            hint={margin !== null ? `Gross margin ${margin.toFixed(1)}%` : undefined}
          />
          <SectionHeading>Expenses</SectionHeading>
          <StatementLine label="Operating expenses" value={-data.operating_expenses} indent />
          <StatementLine label="Net income" value={data.net_income} variant="total" />
        </>
      )}
    </ReportBody>
  )
}

function ProfitAndLoss() {
  const [start, setStart] = useState(yearStart)
  const [end, setEnd] = useState(todayLocalISODate)
  const params = start && end && start <= end ? { start, end } : null

  return (
    <ReportCard
      title="Profit & Loss"
      description={`${formatDate(start)} – ${formatDate(end)}`}
      onDownload={params ? () => downloadCsv("profit-and-loss/", params, `profit-and-loss_${start}_${end}.csv`) : undefined}
      controls={
        <>
          <DateField id="pnl-start" label="From" value={start} onChange={setStart} max={end} />
          <DateField id="pnl-end" label="To" value={end} onChange={setEnd} min={start} />
        </>
      }
    >
      {params && <ProfitAndLossBody params={params} />}
    </ReportCard>
  )
}

function BalanceSheetBody({ params }: { params: Record<string, string> }) {
  const { data, error, isLoading, reload } = useReport<BalanceSheetReport>("balance-sheet/", params)
  const balanced = !data || data.out_of_balance === 0
  return (
    <ReportBody isLoading={isLoading} error={error} onRetry={reload} hasData={!!data}>
      {data && (
        <>
          <SectionHeading>Assets</SectionHeading>
          <StatementLine label="Inventory" value={data.inventory_asset} indent />
          <StatementLine
            label="Other assets"
            value={data.other_assets}
            indent
            hint="Bank, receivables and other asset accounts"
          />
          <StatementLine label="Total assets" value={data.assets} variant="subtotal" />

          <SectionHeading>Liabilities</SectionHeading>
          <StatementLine label="Total liabilities" value={data.liabilities} variant="subtotal" />

          <SectionHeading>Equity</SectionHeading>
          <StatementLine label="Contributed equity" value={data.contributed_equity} indent />
          <StatementLine label="Retained earnings" value={data.retained_earnings} indent hint="Accumulated net income to date" />
          <StatementLine label="Total equity" value={data.equity} variant="subtotal" />

          <StatementLine label="Total liabilities & equity" value={data.liabilities_and_equity} variant="total" />
          <p
            className={cn(
              "mt-3 inline-flex items-center gap-1.5 text-xs",
              balanced ? "text-green-600 dark:text-green-500" : "text-destructive"
            )}
          >
            {balanced ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />}
            {balanced
              ? "Assets equal liabilities plus equity."
              : `Out of balance by ${formatCurrency(Math.abs(data.out_of_balance))}.`}
          </p>
        </>
      )}
    </ReportBody>
  )
}

function BalanceSheet() {
  const [asOf, setAsOf] = useState(todayLocalISODate)
  const params = asOf ? { as_of: asOf } : null

  return (
    <ReportCard
      title="Balance Sheet"
      description={`As of ${formatDate(asOf)}`}
      onDownload={params ? () => downloadCsv("balance-sheet/", params, `balance-sheet_${asOf}.csv`) : undefined}
      controls={<DateField id="bs-asof" label="As of" value={asOf} onChange={setAsOf} />}
    >
      {params && <BalanceSheetBody params={params} />}
    </ReportCard>
  )
}

function CashFlowBody({ params }: { params: Record<string, string> }) {
  const { data, error, isLoading, reload } = useReport<CashFlowReport>("cash-flow/", params)
  return (
    <ReportBody isLoading={isLoading} error={error} onRetry={reload} hasData={!!data}>
      {data && (
        <>
          <StatementLine
            label="Net change in cash"
            value={data.net_change_in_cash}
            variant="total"
            hint="Movement on the Bank account over the period"
          />
          <Note>
            The ledger tracks cash through a single Bank account, so operating, investing and financing activities
            aren&apos;t broken out separately.
          </Note>
        </>
      )}
    </ReportBody>
  )
}

function CashFlow() {
  const [start, setStart] = useState(yearStart)
  const [end, setEnd] = useState(todayLocalISODate)
  const params = start && end && start <= end ? { start, end } : null

  return (
    <ReportCard
      title="Cash Flow"
      description={`${formatDate(start)} – ${formatDate(end)}`}
      onDownload={params ? () => downloadCsv("cash-flow/", params, `cash-flow_${start}_${end}.csv`) : undefined}
      controls={
        <>
          <DateField id="cf-start" label="From" value={start} onChange={setStart} max={end} />
          <DateField id="cf-end" label="To" value={end} onChange={setEnd} min={start} />
        </>
      }
    >
      {params && <CashFlowBody params={params} />}
    </ReportCard>
  )
}

const VALUATION_PARAMS = { kind: "stock" }

function InventoryValuationBody() {
  const { data, error, isLoading, reload } = useReport<InventoryValuationReport>("inventory-valuation/", VALUATION_PARAMS)
  return (
    <ReportBody isLoading={isLoading} error={error} onRetry={reload} hasData={!!data}>
      {data && (
        <>
          <StatementLine
            label="Stock items on hand × average cost"
            value={data.inventory_value}
            variant="subtotal"
          />
          <SectionHeading>Ledger check</SectionHeading>
          <StatementLine
            label="Goods on hand per ledger"
            value={data.ledger_inventory_asset}
            hint="Ledger entries for stock"
          />
          <StatementLine
            label="Difference"
            value={data.ledger_difference}
            variant="total"
            hint="Should be zero when goods on hand and ledger agree"
          />
        </>
      )}
    </ReportBody>
  )
}

function InventoryValuation() {
  return (
    <ReportCard title="Inventory Valuation" description="Goods on hand valued at moving average cost, right now.">
      <InventoryValuationBody />
    </ReportCard>
  )
}

const FinancialReports = () => {
  useDocumentTitle("Financial reports")
  return (
    <div className="section-container space-y-6">
      <PageHeader title="Financial reports" />
      <p className="max-w-3xl text-sm text-muted-foreground">
        Figures for the whole business. Revenue is recorded when the goods are shipped.
      </p>
      <Tabs defaultValue="pnl" className="space-y-4">
        {/* Four names do not fit one phone row, so they sit two by two there. */}
        <TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-fit">
          <TabsTrigger value="pnl">Profit &amp; Loss</TabsTrigger>
          <TabsTrigger value="balance">Balance Sheet</TabsTrigger>
          <TabsTrigger value="cash">Cash Flow</TabsTrigger>
          <TabsTrigger value="inventory">Inventory Valuation</TabsTrigger>
        </TabsList>
        <TabsContent value="pnl">
          <ProfitAndLoss />
        </TabsContent>
        <TabsContent value="balance">
          <BalanceSheet />
        </TabsContent>
        <TabsContent value="cash">
          <CashFlow />
        </TabsContent>
        <TabsContent value="inventory">
          <InventoryValuation />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default FinancialReports
