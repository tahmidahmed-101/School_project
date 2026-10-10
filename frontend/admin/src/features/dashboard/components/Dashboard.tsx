import { useMemo } from "react"
import { Link } from "react-router-dom"
import { BarChart3 } from "lucide-react"
import { getNavGroups } from "@/app/modules"
import { PageHeader } from "@/components/common/PageHeader"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan, usePermissions } from "@/hooks/use-can"
import { kindOfPath } from "@/hooks/use-kind"
import { isForbidden } from "@/lib/api/client"
import { rangeSearch, useDateRange } from "@/features/analytics/dateRange"
import { REPORT_PERMISSIONS, useDashboardReport } from "@/features/analytics/hooks"
import { DateRangeControl } from "@/features/analytics/components/DateRangeControl"
import { KpiCards } from "@/features/analytics/components/KpiCards"
import { RevenueComparisonChart } from "@/features/analytics/components/RevenueComparisonChart"
import { TopProductsTable } from "@/features/analytics/components/TopProductsTable"
import { LowStockAlerts } from "@/features/analytics/components/LowStockAlerts"
import { FulfillmentStatus } from "@/features/analytics/components/FulfillmentStatus"
import { RecentOrders } from "@/features/analytics/components/RecentOrders"
import { ReportsUnavailable } from "@/features/analytics/components/ReportsUnavailable"

const Dashboard = () => {
  useDocumentTitle("Overview")

  const canView = useCan(...REPORT_PERMISSIONS)
  const permissions = usePermissions()
  const { preset, range, setPreset, setCustom } = useDateRange()
  const report = useDashboardReport(range, "stock", canView)
  const blocked = !canView || isForbidden(report.error)

  // Where to send a user who can't see metrics: the first few pages they *can* open.
  const fallbackLinks = useMemo(
    () =>
      getNavGroups(permissions)
        .flatMap((g) => g.sections.flatMap((s) => s.items))
        .filter((item) => kindOfPath(item.url) === "stock" && item.url !== "/" && item.url !== "/analytics")
        .slice(0, 4)
        .map((item) => ({ to: item.url, label: item.title })),
    [permissions]
  )

  const d = report.data
  const state = { isLoading: report.isLoading, error: report.error, onRetry: report.retry }

  return (
    <div className="section-container flex flex-col gap-5">
      <PageHeader
        title="Overview"
        actions={
          !blocked && (
            <DateRangeControl
              preset={preset}
              range={range}
              onPreset={setPreset}
              onCustom={setCustom}
              busy={report.isRefreshing}
            />
          )
        }
      />

      {blocked ? (
        <ReportsUnavailable links={fallbackLinks} />
      ) : (
        <>
          <KpiCards kpis={d?.kpis} {...state} />

          <RevenueComparisonChart points={d?.revenue} {...state} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <TopProductsTable kind="stock" products={d?.top_products} {...state} className="xl:col-span-2" />
            {/* Top products sets the row's height. Low stock is taken out of the flow on wide
                screens so it matches that height and scrolls its list, instead of stretching
                the row to fit every low-stock variant. */}
            <div className="relative xl:min-h-[22rem]">
              <LowStockAlerts
                items={d?.inventory}
                counts={d?.low_stock}
                {...state}
                className="xl:absolute xl:inset-0"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <RecentOrders kind="stock" orders={d?.orders} {...state} className="xl:col-span-2" />
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
