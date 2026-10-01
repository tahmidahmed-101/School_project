import { PageHeader } from "@/components/common/PageHeader"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { isForbidden } from "@/lib/api/client"
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
import { ReportsUnavailable } from "./ReportsUnavailable"
import { SalesTrendChart } from "./SalesTrendChart"
import { StockTurnoverCard } from "./StockTurnoverCard"

const Analytics = () => {
  useDocumentTitle("Analytics")

  const canView = useCan(...REPORT_PERMISSIONS)
  const { preset, range, setPreset, setCustom } = useDateRange()

  const sales = useSalesTrendReport(range, canView)
  const turnover = useStockTurnoverReport(range, canView)
  const lowStock = useLowStockReport(canView)
  // Category revenue and customer segments are only exposed through the dashboard payload.
  const dashboard = useDashboardReport(range, canView)

  const blocked = !canView || isForbidden(sales.error)
  const refreshing = sales.isRefreshing || turnover.isRefreshing || dashboard.isRefreshing

  return (
    <div className="section-container flex flex-col gap-5">
      <PageHeader
        title="Analytics"
        description="Sales, stock and customer reports for the selected period."
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
        <ReportsUnavailable links={[{ to: "/", label: "Back to overview" }]} />
      ) : (
        <>
          <SalesTrendChart points={sales.data} isLoading={sales.isLoading} error={sales.error} onRetry={sales.retry} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <StockTurnoverCard
              turnover={turnover.data}
              isLoading={turnover.isLoading}
              error={turnover.error}
              onRetry={turnover.retry}
            />
            <CategoryBreakdown
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

          <LowStockTable
            items={lowStock.data}
            isLoading={lowStock.isLoading}
            error={lowStock.error}
            onRetry={lowStock.retry}
          />
        </>
      )}
    </div>
  )
}

export default Analytics
