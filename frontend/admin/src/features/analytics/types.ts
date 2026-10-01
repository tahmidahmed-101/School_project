// Mirrors kull-mart backend api/v1/admin/reporting/serializers.py.
// DecimalField values arrive as strings; FloatField/IntegerField as numbers.

export type MeasureUnit = "currency" | "count" | "ratio"
export type TrendDirection = "up" | "down" | "flat"

/** ?start=&end= window (DateRangeSerializer) — both required, "YYYY-MM-DD". */
export interface DateRangeParams {
  start: string
  end: string
}

export interface DashboardKpi {
  label: string
  value: number
  unit: MeasureUnit
  /** null = no baseline in the previous window; hide the delta. */
  delta_pct: number | null
  sign: TrendDirection
  good: boolean
  spark: number[]
}

export interface RevenuePoint {
  /** "YYYY-MM-DD" of the current-window day. */
  label: string
  current: number
  previous: number
}

export interface CategoryShare {
  name: string
  revenue: string
  pct: number
}

export interface DashboardOrderLine {
  name: string
  sku: string
  quantity: number
}

export interface DashboardOrder {
  /** Order number, e.g. "SO-8EE72314". */
  id: string
  /** Order UUID (for /order_detail/:id). */
  order_id: string
  customer: { name: string }
  items: DashboardOrderLine[]
  total_amount: string
  payment_method: string
  /** Display label: Pending, Awaiting payment, Processing, Fulfilled, Refunded. */
  status: string
  region: string
  created_at: string
}

export interface TopProduct {
  rank: number
  sku: string
  name: string
  units: number
  revenue: string
  stock: number
  spark: number[]
}

export interface InventoryAlert {
  sku: string
  name: string
  stock: number
  reorder: number
  level: "low" | "critical"
}

export interface LowStockCounts {
  total: number
  critical: number
}

export interface CustomerSegment {
  name: string
  count: number
  pct: number
  color: string
}

export interface FulfillmentMetric {
  label: string
  value: number
  delta_pct: number | null
  good: boolean
}

export interface TickerItem {
  label: string
  value: number
  unit: MeasureUnit
  dir: TrendDirection
}

export interface DashboardData {
  kpis: DashboardKpi[]
  revenue: RevenuePoint[]
  categories: CategoryShare[]
  orders: DashboardOrder[]
  top_products: TopProduct[]
  inventory: InventoryAlert[]
  low_stock: LowStockCounts
  segments: CustomerSegment[]
  fulfillment: FulfillmentMetric[]
  ticker: TickerItem[]
}

export interface SalesTrendPoint {
  date: string
  total: string
}

export interface StockTurnover {
  turnover_ratio: number
}

/** One low-stock StockItem row (per stock location, not rolled up per variant). */
export interface LowStockItem {
  id: string
  variant_id: string
  variant_sku: string
  product_name: string
  quantity_on_hand: number
  quantity_reserved: number
  available: number
  reorder_point: number
}
