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
import { REPORT_PERMISSIONS, useDashboardReport, useSalesTrendReport } from "@/features/analytics/hooks"
import { DateRangeControl } from "@/features/analytics/components/DateRangeControl"
import { PreorderSummaryCard } from "@/features/analytics/components/PreorderSummaryCard"
import { RecentOrders } from "@/features/analytics/components/RecentOrders"
import { ReportsUnavailable } from "@/features/analytics/components/ReportsUnavailable"
import { SalesTrendChart } from "@/features/analytics/components/SalesTrendChart"
import { TopProductsTable } from "@/features/analytics/components/TopProductsTable"

const OWN_PAGES = ["/preorder_overview", "/preorder_analytics"]

const PreorderOverview = () => {
  useDocumentTitle("Pre-order overview")

  const canView = useCan(...REPORT_PERMISSIONS)
  const canOpenAnalytics = useCan("reports.view")
  const permissions = usePermissions()
  const { preset, range, setPreset, setCustom } = useDateRange()
  const report = useDashboardReport(range, "preorder", canView)
  const trend = useSalesTrendReport(range, "preorder", canView)
  const blocked = !canView || isForbidden(report.error)

  const fallbackLinks = useMemo(
    () =>
      getNavGroups(permissions)
        .flatMap((g) => g.sections.flatMap((s) => s.items))
        .filter((item) => kindOfPath(item.url) === "preorder" && !OWN_PAGES.includes(item.url))
        .slice(0, 4)
        .map((item) => ({ to: item.url, label: item.title })),
    [permissions]
  )

  const d = report.data
  const state = { isLoading: report.isLoading, error: report.error, onRetry: report.retry }

  return (
    <div className="section-container flex flex-col gap-5">
      <PageHeader
        title="Pre-order overview"
        actions={
          !blocked && (
            <DateRangeControl
              preset={preset}
              range={range}
              onPreset={setPreset}
              onCustom={setCustom}
              busy={report.isRefreshing || trend.isRefreshing}
            />
          )
        }
      />

      {blocked ? (
        <ReportsUnavailable links={fallbackLinks} />
      ) : (
        <>
          {d?.preorder && <PreorderSummaryCard summary={d.preorder} />}

          <SalesTrendChart
            kind="preorder"
            points={trend.data}
            isLoading={trend.isLoading}
            error={trend.error}
            onRetry={trend.retry}
          />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <TopProductsTable kind="preorder" products={d?.top_products} {...state} />
            <RecentOrders kind="preorder" orders={d?.orders} {...state} />
          </div>

          {canOpenAnalytics && (
            <div className="flex justify-end">
              <Link
                to={`/preorder_analytics${rangeSearch(preset, range)}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <BarChart3 className="size-4" aria-hidden />
                More in pre-order analytics
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default PreorderOverview
