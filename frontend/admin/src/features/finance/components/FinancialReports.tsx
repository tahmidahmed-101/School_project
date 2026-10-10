import { useCallback, useEffect, useState, type ReactNode } from "react"
import { startOfYear } from "date-fns"
import { toast } from "sonner"
import { AlertCircle, CheckCircle2, DownloadIcon, Loader2, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeading } from "@/components/common/PageHeading"
import { api, extractApiError, getApiErrorMessage } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import { formatCurrency, formatDate, toISODate, todayLocalISODate } from "@/lib/format"
import { blobErrorToJson, saveBlob } from "@/lib/download"
import { cn } from "@/lib/utils"
import { useDocumentTitle } from "@/hooks/use-document-title"
import type { Kind } from "@/hooks/use-kind"
import { KindSwitch } from "@/features/analytics/components/KindSwitch"
import { BelongsToSwitch } from "./BelongsToSwitch"
import type {
  BalanceSheetReport,
  CashFlowReport,
  InventoryValuationReport,
  KindBalanceSheetReport,
  KindCashFlowReport,
  KindProfitAndLossReport,
  ProfitAndLossReport,
} from "../types"

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

/** The stock / pre-order / company switch, labelled and as tall as the date inputs beside it. */
function ViewField({ children }: { children: ReactNode }) {
  return (
    <div className="w-full space-y-1 sm:w-auto [&_[data-slot=tabs-list]]:h-11! [&_[data-slot=tabs-list]]:w-full sm:[&_[data-slot=tabs-list]]:w-fit [&_[data-slot=tabs-trigger]]:px-4">
      <span className="block text-xs font-medium text-muted-foreground">Show figures for</span>
      {children}
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

type View = Kind | "company"

const VIEW_LABELS: Record<View, string> = { stock: "Stock", preorder: "Pre-order", company: "Company" }
const VIEW_NOUN: Record<Kind, string> = { stock: "stock", preorder: "pre-order" }

const withView = (params: Record<string, string>, view: View) => (view === "company" ? params : { ...params, kind: view })

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-xs text-muted-foreground">{children}</p>
}

function KindProfitAndLoss({ kind, params }: { kind: Kind; params: Record<string, string> }) {
  const { data, error, isLoading, reload } = useReport<KindProfitAndLossReport>("profit-and-loss/", params)
  const margin = data?.gross_margin_percent ?? null
  return (
    <ReportBody isLoading={isLoading} error={error} onRetry={reload} hasData={!!data}>
      {data && (
        <>
          <SectionHeading>{VIEW_LABELS[kind]} sales</SectionHeading>
          <StatementLine label="Sales" value={data.revenue} hint="Shipped goods, less returns" />
          <StatementLine label="Cost of goods sold" value={-data.cost_of_goods_sold} indent />
          <StatementLine
            label="Gross profit"
            value={data.gross_profit}
            variant="subtotal"
            hint={margin !== null ? `Gross margin ${margin.toFixed(1)}%` : undefined}
          />
          <SectionHeading>{VIEW_LABELS[kind]} costs</SectionHeading>
          <StatementLine label="Goods written off or adjusted" value={-data.goods_written_off} indent />
          <StatementLine
            label={`${VIEW_LABELS[kind]} expenses`}
            value={-data.operating_expenses}
            indent
            hint={`Expenses and entries marked ${VIEW_NOUN[kind]} only`}
          />
          <StatementLine
            label={`${VIEW_LABELS[kind]} profit before whole-business costs`}
            value={data.profit_before_company_costs}
            variant="total"
          />
          {kind === "preorder" && (
            <Note>A deposit is money held, not a sale. Sales are counted when the goods are shipped.</Note>
          )}
          <Note>
            This is not net income. Rent, salaries and other costs recorded for the whole business are not split
            between stock and pre-order, so they are not taken off here. They, and net income, are in the Company view.
          </Note>
        </>
      )}
    </ReportBody>
  )
}

function CompanyProfitAndLoss({ params }: { params: Record<string, string> }) {
  const { data, error, isLoading, reload } = useReport<ProfitAndLossReport>("profit-and-loss/", params)
  const margin = data?.gross_margin_percent ?? null
  const hasUnmarked = !!data && (Number(data.unassigned_revenue) !== 0 || Number(data.unassigned_cost_of_goods_sold) !== 0)
  return (
    <ReportBody isLoading={isLoading} error={error} onRetry={reload} hasData={!!data}>
      {data && (
        <>
          <SectionHeading>Income, stock and pre-order together</SectionHeading>
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
          {hasUnmarked && (
            <Note>
              {formatCurrency(data.unassigned_revenue)} of sales and {formatCurrency(data.unassigned_cost_of_goods_sold)}{" "}
              of cost of goods are on entries not marked stock or pre-order, so they show here only.
            </Note>
          )}
        </>
      )}
    </ReportBody>
  )
}

function ProfitAndLoss() {
  const [view, setView] = useState<View>("stock")
  const [start, setStart] = useState(yearStart)
  const [end, setEnd] = useState(todayLocalISODate)
  const params = start && end && start <= end ? withView({ start, end }, view) : null

  return (
    <ReportCard
      title="Profit & Loss"
      description={`${VIEW_LABELS[view]} · ${formatDate(start)} – ${formatDate(end)}`}
      onDownload={
        params ? () => downloadCsv("profit-and-loss/", params, `profit-and-loss_${view}_${start}_${end}.csv`) : undefined
      }
      controls={
        <>
          <ViewField>
            <BelongsToSwitch label="Show figures for" value={view} onChange={setView} />
          </ViewField>
          <DateField id="pnl-start" label="From" value={start} onChange={setStart} max={end} />
          <DateField id="pnl-end" label="To" value={end} onChange={setEnd} min={start} />
        </>
      }
    >
      {params &&
        (view === "company" ? (
          <CompanyProfitAndLoss key={view} params={params} />
        ) : (
          <KindProfitAndLoss key={view} kind={view} params={params} />
        ))}
    </ReportCard>
  )
}

function KindBalanceSheet({ kind, params }: { kind: Kind; params: Record<string, string> }) {
  const { data, error, isLoading, reload } = useReport<KindBalanceSheetReport>("balance-sheet/", params)
  return (
    <ReportBody isLoading={isLoading} error={error} onRetry={reload} hasData={!!data}>
      {data && (
        <>
          <SectionHeading>{VIEW_LABELS[kind]} only</SectionHeading>
          <StatementLine label="Goods on hand" value={data.inventory_asset} hint="At cost, per the ledger" />
          <StatementLine
            label="Customer balance"
            value={data.customer_balance}
            hint={
              kind === "preorder"
                ? "Owed by customers. A minus means money held: deposits paid before the goods ship."
                : "Owed by customers. A minus means customers have paid ahead."
            }
          />
          <StatementLine label="Owed to suppliers" value={data.accounts_payable} hint="Bills not yet paid" />
          <StatementLine label="Goods received, not yet billed" value={data.goods_received_not_billed} />
          <Note>
            Cash, tax and the owner&apos;s equity belong to the whole business and are not split between stock and
            pre-order. They are in the Company view.
          </Note>
        </>
      )}
    </ReportBody>
  )
}

function CompanyBalanceSheet({ params }: { params: Record<string, string> }) {
  const { data, error, isLoading, reload } = useReport<BalanceSheetReport>("balance-sheet/", params)
  const balanced = !data || data.out_of_balance === 0
  return (
    <ReportBody isLoading={isLoading} error={error} onRetry={reload} hasData={!!data}>
      {data && (
        <>
          <SectionHeading>Assets, stock and pre-order together</SectionHeading>
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
  const [view, setView] = useState<View>("stock")
  const [asOf, setAsOf] = useState(todayLocalISODate)
  const params = asOf ? withView({ as_of: asOf }, view) : null

  return (
    <ReportCard
      title="Balance Sheet"
      description={`${VIEW_LABELS[view]} · as of ${formatDate(asOf)}`}
      onDownload={params ? () => downloadCsv("balance-sheet/", params, `balance-sheet_${view}_${asOf}.csv`) : undefined}
      controls={
        <>
          <ViewField>
            <BelongsToSwitch label="Show figures for" value={view} onChange={setView} />
          </ViewField>
          <DateField id="bs-asof" label="As of" value={asOf} onChange={setAsOf} />
        </>
      }
    >
      {params &&
        (view === "company" ? (
          <CompanyBalanceSheet key={view} params={params} />
        ) : (
          <KindBalanceSheet key={view} kind={view} params={params} />
        ))}
    </ReportCard>
  )
}

function KindCashFlow({ kind, params }: { kind: Kind; params: Record<string, string> }) {
  const { data, error, isLoading, reload } = useReport<KindCashFlowReport>("cash-flow/", params)
  return (
    <ReportBody isLoading={isLoading} error={error} onRetry={reload} hasData={!!data}>
      {data && (
        <>
          <SectionHeading>{VIEW_LABELS[kind]} only</SectionHeading>
          <StatementLine
            label="Received from customers"
            value={data.customer_receipts}
            hint={kind === "preorder" ? "Deposits and balances paid" : undefined}
          />
          <StatementLine label="Refunded to customers" value={-data.customer_refunds} />
          <StatementLine label="Paid to suppliers" value={-data.supplier_payments} />
          <StatementLine
            label={`${VIEW_LABELS[kind]} expenses paid`}
            value={-data.expenses_paid}
            hint={`Expenses marked ${VIEW_NOUN[kind]} only, paid from the Bank account`}
          />
          {Number(data.other) !== 0 && (
            <StatementLine label="Other" value={data.other} hint={`Manual entries marked ${VIEW_NOUN[kind]}`} />
          )}
          <StatementLine label={`Net cash from ${VIEW_NOUN[kind]}`} value={data.net_change_in_cash} variant="total" />
          <Note>
            Whole-business expenses, owner money and entries not marked stock or pre-order are not split. They are in
            the Company view.
          </Note>
        </>
      )}
    </ReportBody>
  )
}

function CompanyCashFlow({ params }: { params: Record<string, string> }) {
  const { data, error, isLoading, reload } = useReport<CashFlowReport>("cash-flow/", params)
  return (
    <ReportBody isLoading={isLoading} error={error} onRetry={reload} hasData={!!data}>
      {data && (
        <>
          <SectionHeading>Whole business, stock and pre-order together</SectionHeading>
          <StatementLine
            label="Not tied to stock or pre-order"
            value={data.company_wide}
            hint="Whole-business expenses paid, owner money and entries with no stock or pre-order mark"
          />
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
  const [view, setView] = useState<View>("stock")
  const [start, setStart] = useState(yearStart)
  const [end, setEnd] = useState(todayLocalISODate)
  const params = start && end && start <= end ? withView({ start, end }, view) : null

  return (
    <ReportCard
      title="Cash Flow"
      description={`${VIEW_LABELS[view]} · ${formatDate(start)} – ${formatDate(end)}`}
      onDownload={params ? () => downloadCsv("cash-flow/", params, `cash-flow_${view}_${start}_${end}.csv`) : undefined}
      controls={
        <>
          <ViewField>
            <BelongsToSwitch label="Show figures for" value={view} onChange={setView} />
          </ViewField>
          <DateField id="cf-start" label="From" value={start} onChange={setStart} max={end} />
          <DateField id="cf-end" label="To" value={end} onChange={setEnd} min={start} />
        </>
      }
    >
      {params &&
        (view === "company" ? (
          <CompanyCashFlow key={view} params={params} />
        ) : (
          <KindCashFlow key={view} kind={view} params={params} />
        ))}
    </ReportCard>
  )
}

function KindValuation({ kind }: { kind: Kind }) {
  const { data, error, isLoading, reload } = useReport<InventoryValuationReport>("inventory-valuation/", { kind })
  return (
    <ReportBody isLoading={isLoading} error={error} onRetry={reload} hasData={!!data}>
      {data && (
        <>
          <StatementLine
            label={kind === "preorder" ? "Pre-order items on hand × average cost" : "Stock items on hand × average cost"}
            value={data.inventory_value}
            variant="subtotal"
          />
          <SectionHeading>Ledger check ({VIEW_NOUN[kind]} only)</SectionHeading>
          <StatementLine
            label="Goods on hand per ledger"
            value={data.ledger_inventory_asset}
            hint={`Ledger entries marked ${VIEW_NOUN[kind]}`}
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
  const [kind, setKind] = useState<Kind>("stock")
  return (
    <ReportCard
      title="Inventory Valuation"
      description="Goods on hand valued at moving average cost, right now."
      controls={
        <ViewField>
          <KindSwitch value={kind} onChange={setKind} />
        </ViewField>
      }
    >
      <KindValuation key={kind} kind={kind} />
    </ReportCard>
  )
}

const FinancialReports = () => {
  useDocumentTitle("Financial Reports")
  return (
    <div className="section-container space-y-6">
      <PageHeading title="Financial Reports" />
      <p className="max-w-3xl text-sm text-muted-foreground">
        Each report shows stock or pre-order on its own, with the expenses marked for that half. Figures that belong to
        the whole business, such as cash, rent, salaries and net income, are in the Company view. A pre-order deposit is money held, not a sale: revenue is
        recorded when the goods are shipped.
      </p>
      <Tabs defaultValue="pnl" className="space-y-4">
        {/* Four names do not fit one phone row, so they sit two by two there. */}
        <TabsList className="grid h-auto! w-full grid-cols-2 gap-1 sm:inline-flex sm:h-8! sm:w-fit sm:gap-0 [&_[data-slot=tabs-trigger]]:py-1.5 sm:[&_[data-slot=tabs-trigger]]:py-0.5">
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
