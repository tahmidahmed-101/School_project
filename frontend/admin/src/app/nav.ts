import {
  Boxes,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Settings,
  ShoppingBasket,
  ShoppingCart,
  SlidersHorizontal,
  Truck,
  UserCog,
  Users,
  Warehouse,
} from "lucide-react"
import { ADMIN_ONLY } from "@/features/system/permissions"
import type { NavSection } from "./moduleTypes"

const ORDERS = ["orders.view", "orders.manage"] as const
const CATALOG = ["catalog.view", "catalog.manage"] as const
const INVENTORY = ["inventory.view", "inventory.manage", "inventory.adjust"] as const
const SHIPMENTS = ["shipments.view", "shipments.update"] as const
const PURCHASING = ["purchasing.view", "purchasing.manage"] as const
const BILLS = ["accounting.view", "accounting.post", "invoices.manage"] as const
const ACCOUNTING = ["accounting.view", "accounting.post"] as const

// Shop pages go under STOCK; a page of the whole company goes under BUSINESS.
export const navSections: NavSection[] = [
  {
    label: "Home",
    icon: LayoutDashboard,
    group: "STOCK",
    items: [
      { title: "Overview", url: "/" },
      { title: "Analytics", url: "/analytics", permission: "reports.view", module: "reporting" },
    ],
  },
  {
    label: "Sales",
    icon: ShoppingCart,
    group: "STOCK",
    items: [
      { title: "Orders", url: "/orders", permission: ORDERS },
      { title: "Carts", url: "/carts", permission: ORDERS },
      { title: "Payments", url: "/payments", permission: ORDERS },
      // The RMA endpoints require returns.manage even for reading.
      { title: "Returns", url: "/returns", permission: "returns.manage" },
    ],
  },
  {
    label: "Catalog",
    icon: Boxes,
    group: "STOCK",
    items: [
      { title: "Products", url: "/products", permission: CATALOG },
      { title: "Bundles", url: "/bundles", permission: CATALOG },
      { title: "Categories", url: "/categories", permission: CATALOG },
      { title: "Brands", url: "/brands", permission: CATALOG },
      { title: "Attributes", url: "/attributes", permission: CATALOG },
    ],
  },
  {
    label: "Customers",
    icon: Users,
    group: "STOCK",
    items: [
      { title: "Customers", url: "/customers", permission: ADMIN_ONLY },
      { title: "Reviews", url: "/reviews", permission: CATALOG },
      { title: "Questions", url: "/questions", permission: CATALOG },
      { title: "Price reports", url: "/price_reports", permission: CATALOG },
      { title: "Fraud cases", url: "/fraud_cases", permission: "risk.view" },
    ],
  },
  {
    label: "Goods",
    icon: Warehouse,
    group: "STOCK",
    items: [
      { title: "Stock", url: "/inventory", permission: INVENTORY },
      { title: "Stock movements", url: "/inventory/ledger", permission: INVENTORY },
      { title: "Transfers", url: "/inventory/transfers", permission: INVENTORY },
      // Served by the orders app: GET needs orders.view (release needs orders.manage).
      { title: "Reservations", url: "/inventory/reservations", permission: ORDERS },
      { title: "Warehouses", url: "/warehouses", permission: INVENTORY },
    ],
  },
  {
    label: "Delivery",
    icon: Truck,
    group: "STOCK",
    items: [
      { title: "Shipments", url: "/shipments", permission: SHIPMENTS },
      { title: "Delivery zones", url: "/shipping_zones", permission: SHIPMENTS, module: "logistics" },
      { title: "Shipping rates", url: "/shipping_rates", permission: SHIPMENTS, module: "logistics" },
    ],
  },
  {
    label: "Purchasing",
    icon: ShoppingBasket,
    group: "STOCK",
    items: [
      { title: "Suppliers", url: "/purchasing/suppliers", permission: PURCHASING, module: "procurement" },
      { title: "Purchase orders", url: "/purchasing/orders", permission: PURCHASING, module: "procurement" },
      { title: "Goods receipts", url: "/purchasing/receipts", permission: PURCHASING, module: "procurement" },
      { title: "Supplier bills", url: "/purchasing/bills", permission: BILLS, module: "procurement" },
      { title: "Supplier payments", url: "/purchasing/payments", permission: BILLS, module: "procurement" },
    ],
  },
  {
    label: "Marketing",
    icon: Megaphone,
    group: "STOCK",
    items: [
      { title: "Promotions", url: "/sales", permission: ORDERS },
      { title: "Coupons", url: "/coupons", permission: ORDERS },
      { title: "Referrals", url: "/referrals", permission: ORDERS },
      { title: "Promotion popups", url: "/promotion_popups", permission: "settings.view" },
    ],
  },
  {
    label: "Settings",
    icon: SlidersHorizontal,
    group: "STOCK",
    items: [{ title: "Shop settings", url: "/settings", permission: "settings.view" }],
  },

  {
    label: "Accounting",
    icon: Landmark,
    group: "BUSINESS",
    items: [
      { title: "Financial reports", url: "/accounting/reports", permission: ACCOUNTING },
      { title: "Expenses", url: "/expenses", permission: ACCOUNTING },
      { title: "Expense categories", url: "/expenses/categories", permission: ACCOUNTING },
      { title: "Journal entries", url: "/accounting/journal-entries", permission: ACCOUNTING },
      { title: "Chart of accounts", url: "/accounting/accounts", permission: ACCOUNTING },
      { title: "Tax rates", url: "/accounting/tax-rates", permission: ACCOUNTING },
    ],
  },
  {
    label: "Team",
    icon: UserCog,
    group: "BUSINESS",
    items: [
      { title: "Staff", url: "/staffs", permission: ADMIN_ONLY },
      // /admin/audit/ is IsAdmin-only on the backend.
      { title: "Audit logs", url: "/audit-logs", permission: ADMIN_ONLY },
      { title: "Login history", url: "/login-history", permission: ADMIN_ONLY },
    ],
  },
  {
    label: "Shared",
    icon: Settings,
    group: "BUSINESS",
    items: [
      { title: "Carriers", url: "/carriers", permission: SHIPMENTS },
      { title: "Blocklists", url: "/blocklists", permission: "risk.view" },
      { title: "Subscribers", url: "/subscribers", permission: ["marketing.view", "marketing.manage"] },
      { title: "Email campaigns", url: "/campaigns", permission: ["marketing.view", "marketing.manage"] },
      { title: "Blocked emails", url: "/email_blocklist", permission: ["marketing.view", "marketing.manage"] },
    ],
  },
]
