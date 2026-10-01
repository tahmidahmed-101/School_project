import { useMemo } from "react"
import { Link } from "react-router-dom"
import { BarChart3 } from "lucide-react"
import { useAppSelector } from "@/app/hooks"
import { getNavGroups } from "@/app/modules"
import { PageHeading } from "@/components/common/PageHeading"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { rangeSearch, useDateRange } from "@/features/analytics/dateRange"
import { isForbidden, useCanViewReports, useDashboardReport } from "@/features/analytics/hooks"
import { DateRangeControl } from "@/features/analytics/components/DateRangeControl"
import { KpiCards } from "@/features/analytics/components/KpiCards"
import { RevenueComparisonChart } from "@/features/analytics/components/RevenueComparisonChart"
import { CategoryBreakdown } from "@/features/analytics/components/CategoryBreakdown"
import { TopProductsTable } from "@/features/analytics/components/TopProductsTable"
import { LowStockAlerts } from "@/features/analytics/components/LowStockAlerts"
import { FulfillmentStatus } from "@/features/analytics/components/FulfillmentStatus"
import { RecentOrders } from "@/features/analytics/components/RecentOrders"
import { ReportsUnavailable } from "@/features/analytics/components/ReportsUnavailable"

const Dashboard = () => {
  useDocumentTitle("Overview")

  const canView = useCanViewReports()
  const permissions = useAppSelector((state) => state.auth.user?.permissions)
  const { preset, range, setPreset, setCustom } = useDateRange()
  const report = useDashboardReport(range, canView)
  const blocked = !canView || isForbidden(report.error)

  // Where to send a user who can't see metrics: the first few pages they *can* open.
  const fallbackLinks = useMemo(
    () =>
      getNavGroups(permissions)
        .flatMap((g) => g.sections.flatMap((s) => s.items))
        .filter((item) => item.url !== "/" && item.url !== "/analytics")
        .slice(0, 4)
        .map((item) => ({ to: item.url, label: item.title })),
    [permissions]
  )

  const d = report.data
  const state = { isLoading: report.isLoading, error: report.error, onRetry: report.retry }

  return (
    <div className="section-container flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeading title="Overview" description="How the store is doing in the selected period." />
        {!blocked && (
          <DateRangeControl
            preset={preset}
            range={range}
            onPreset={setPreset}
            onCustom={setCustom}
            busy={report.isRefreshing}
          />
        )}
      </div>

      {blocked ? (
        <ReportsUnavailable links={fallbackLinks} />
      ) : (
        <>
          <KpiCards kpis={d?.kpis} {...state} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <RevenueComparisonChart points={d?.revenue} {...state} className="xl:col-span-2" />
            <CategoryBreakdown categories={d?.categories} {...state} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <TopProductsTable products={d?.top_products} {...state} className="xl:col-span-2" />
            <LowStockAlerts items={d?.inventory} counts={d?.low_stock} {...state} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <RecentOrders orders={d?.orders} {...state} className="xl:col-span-2" />
            <FulfillmentStatus metrics={d?.fulfillment} {...state} />
          </div>

          <div className="flex justify-end">
            <Link
              to={`/analytics${rangeSearch(preset, range)}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <BarChart3 className="size-4" aria-hidden />
              More in Analytics
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

export default Dashboard
