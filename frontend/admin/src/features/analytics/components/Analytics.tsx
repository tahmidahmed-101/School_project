import { PageHeader } from "@/components/common/PageHeader"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { useKind } from "@/hooks/use-kind"
import { isForbidden } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { useDateRange } from "../dateRange"
import {
  REPORT_PERMISSIONS,
  useDashboardReport,
  useLowStockReport,
  useSalesTrendReport,
  useStockTurnoverReport,
} from "../hooks"
import { CategoryBreakdown } from "./CategoryBreakdown"
import { CustomerSegments } from "./CustomerSegments"
import { DateRangeControl } from "./DateRangeControl"
import { LowStockTable } from "./LowStockTable"
import { PreorderSummaryCard } from "./PreorderSummaryCard"
import { ReportsUnavailable } from "./ReportsUnavailable"
import { SalesTrendChart } from "./SalesTrendChart"
import { StockTurnoverCard } from "./StockTurnoverCard"

const Analytics = () => {
  const kind = useKind()
  const isStock = kind === "stock"
  const title = isStock ? "Analytics" : "Pre-order analytics"
  useDocumentTitle(title)

  const canView = useCan(...REPORT_PERMISSIONS)
  const { preset, range, setPreset, setCustom } = useDateRange()

  const sales = useSalesTrendReport(range, kind, canView)
  // Turnover and low stock are shop-stock figures, so the pre-order page neither asks for nor shows them.
  const turnover = useStockTurnoverReport(range, "stock", canView && isStock)
  const lowStock = useLowStockReport(canView && isStock)
  // Category revenue and customer segments are only exposed through the dashboard payload.
  const dashboard = useDashboardReport(range, kind, canView)

  const blocked = !canView || isForbidden(sales.error)
  const refreshing = sales.isRefreshing || turnover.isRefreshing || dashboard.isRefreshing

  return (
    <div className="section-container flex flex-col gap-5">
      <PageHeader
        title={title}
        actions={
          !blocked && (
            <DateRangeControl
              preset={preset}
              range={range}
              onPreset={setPreset}
              onCustom={setCustom}
              busy={refreshing}
            />
          )
        }
      />

      {blocked ? (
        <ReportsUnavailable links={[{ to: isStock ? "/" : "/preorder_overview", label: "Back to overview" }]} />
      ) : (
        <>
          <SalesTrendChart
            kind={kind}
            points={sales.data}
            isLoading={sales.isLoading}
            error={sales.error}
            onRetry={sales.retry}
          />

          {dashboard.data?.preorder && <PreorderSummaryCard summary={dashboard.data.preorder} />}

          <div className={cn("grid grid-cols-1 gap-4", isStock ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
            {isStock && (
              <StockTurnoverCard
                turnover={turnover.data}
                isLoading={turnover.isLoading}
                error={turnover.error}
                onRetry={turnover.retry}
              />
            )}
            <CategoryBreakdown
              kind={kind}
              categories={dashboard.data?.categories}
              isLoading={dashboard.isLoading}
              error={dashboard.error}
              onRetry={dashboard.retry}
              limit={8}
            />
            <CustomerSegments
              segments={dashboard.data?.segments}
              isLoading={dashboard.isLoading}
              error={dashboard.error}
              onRetry={dashboard.retry}
            />
          </div>

          {isStock && (
            <LowStockTable
              items={lowStock.data}
              isLoading={lowStock.isLoading}
              error={lowStock.error}
              onRetry={lowStock.retry}
            />
          )}
        </>
      )}
    </div>
  )
}

export default Analytics
