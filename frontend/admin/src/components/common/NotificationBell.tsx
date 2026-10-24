import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellIcon, CircleHelp, CreditCard, PackageX, RotateCcw, Tag, Truck, type LucideIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/app/hooks";
import { hasPermission } from "@/app/modules";
import { useModulesKnown, useOffModules } from "@/hooks/use-modules";
import { api } from "@/lib/api/client";

/**
 * The backend has no staff notification feed, so the bell reports work that is waiting, counted
 * live from the lists staff already have: orders to ship or collect payment for, return requests,
 * unanswered product questions, open price reports and low stock. Every alert counts one half
 * (stock or pre-order) and opens that half's page. Each source is only asked for when the
 * signed-in user may open the page it links to.
 */
interface Source {
  key: string;
  icon: LucideIcon;
  /** Message for a count of one, and for any other count. */
  one: string;
  many: (count: number) => string;
  hint: string;
  to: string;
  permission: string[];
  /** Settings → Modules key; not asked for while that module is switched off. */
  module?: string;
  /** How many are waiting. */
  count: () => Promise<number>;
}

/** `count` of a paginated list endpoint, asking for a single row. */
const listCount = (url: string, params: Record<string, string>) => async () => {
  const res = await api.get(url, { params: { ...params, page_size: 1 } });
  return Number(res.data?.data?.count ?? 0);
};

const ORDER_PERMISSION = ["orders.view", "orders.manage"];
const CATALOG_PERMISSION = ["catalog.view", "catalog.manage"];

const SOURCES: Source[] = [
  {
    key: "orders-to-ship",
    icon: Truck,
    one: "1 stock order is ready to ship",
    many: (n) => `${n} stock orders are ready to ship`,
    hint: "Confirmed and waiting for a shipment.",
    to: "/orders",
    permission: ORDER_PERMISSION,
    count: listCount("/admin/orders/", { status: "confirmed", order_type: "stock" }),
  },
  {
    key: "orders-awaiting-payment",
    icon: CreditCard,
    one: "1 stock order is awaiting payment",
    many: (n) => `${n} stock orders are awaiting payment`,
    hint: "Placed, but the payment has not been captured.",
    to: "/orders",
    permission: ORDER_PERMISSION,
    count: listCount("/admin/orders/", { status: "awaiting_payment", order_type: "stock" }),
  },
  {
    key: "returns",
    icon: RotateCcw,
    one: "1 stock return request to review",
    many: (n) => `${n} stock return requests to review`,
    hint: "Customers asked to send stock items back.",
    to: "/returns",
    permission: ["returns.manage"],
    count: listCount("/admin/orders/returns/", { status: "requested", kind: "stock" }),
  },
  {
    key: "questions",
    icon: CircleHelp,
    one: "1 question on a stock product to answer",
    many: (n) => `${n} questions on stock products to answer`,
    hint: "Not shown on the storefront until answered.",
    to: "/questions",
    permission: CATALOG_PERMISSION,
    count: listCount("/admin/catalog/questions/", { status: "pending", kind: "stock" }),
  },
  {
    key: "price-reports",
    icon: Tag,
    one: "1 price report on a stock product to review",
    many: (n) => `${n} price reports on stock products to review`,
    hint: "Customers reported a price that looks wrong.",
    to: "/price_reports",
    permission: CATALOG_PERMISSION,
    count: listCount("/admin/catalog/price-reports/", { status: "open", kind: "stock" }),
  },
  {
    key: "low-stock",
    icon: PackageX,
    one: "1 item is low on stock",
    many: (n) => `${n} items are low on stock`,
    hint: "At or below their reorder point.",
    to: "/inventory",
    permission: ["reports.view", "accounting.view"],
    module: "reporting",
    count: async () => {
      const res = await api.get("/admin/reporting/low-stock/", { params: { count_only: 1, kind: "stock" } });
      const data = res.data?.data;
      // An API deployed before count_only existed ignores it and sends the rows.
      return Array.isArray(data) ? data.length : Number(data?.count) || 0;
    },
  },
  {
    key: "preorders-confirmed",
    icon: Truck,
    one: "1 pre-order is confirmed and not shipped",
    many: (n) => `${n} pre-orders are confirmed and not shipped`,
    hint: "Waiting for the goods to arrive or to be sent out.",
    to: "/preorders",
    permission: ORDER_PERMISSION,
    count: listCount("/admin/orders/", { status: "confirmed", order_type: "preorder" }),
  },
  {
    key: "preorders-awaiting-payment",
    icon: CreditCard,
    one: "1 pre-order is awaiting payment",
    many: (n) => `${n} pre-orders are awaiting payment`,
    hint: "Placed, but no payment has been recorded yet.",
    to: "/preorders",
    permission: ORDER_PERMISSION,
    count: listCount("/admin/orders/", { status: "awaiting_payment", order_type: "preorder" }),
  },
  {
    key: "preorder-returns",
    icon: RotateCcw,
    one: "1 pre-order return request to review",
    many: (n) => `${n} pre-order return requests to review`,
    hint: "Customers asked to send pre-order items back.",
    to: "/preorder_returns",
    permission: ["returns.manage"],
    count: listCount("/admin/orders/returns/", { status: "requested", kind: "preorder" }),
  },
  {
    key: "preorder-questions",
    icon: CircleHelp,
    one: "1 question on a pre-order product to answer",
    many: (n) => `${n} questions on pre-order products to answer`,
    hint: "Not shown on the storefront until answered.",
    to: "/preorder_questions",
    permission: CATALOG_PERMISSION,
    count: listCount("/admin/catalog/questions/", { status: "pending", kind: "preorder" }),
  },
  {
    key: "preorder-price-reports",
    icon: Tag,
    one: "1 price report on a pre-order product to review",
    many: (n) => `${n} price reports on pre-order products to review`,
    hint: "Customers reported a price that looks wrong.",
    to: "/preorder_price_reports",
    permission: CATALOG_PERMISSION,
    count: listCount("/admin/catalog/price-reports/", { status: "open", kind: "preorder" }),
  },
];

interface Notice {
  source: Source;
  count: number;
}

const REFRESH_MS = 5 * 60_000;
/** What the user last saw when they opened the bell, so the dot only returns when something changed. */
const SEEN_KEY = "notifications:seen";

const signature = (notices: Notice[]) => notices.map((n) => `${n.source.key}:${n.count}`).join("|");

function readSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function NotificationBell() {
  const navigate = useNavigate();
  const permissions = useAppSelector((state) => state.auth.user?.permissions);
  const offModules = useOffModules();
  const modulesKnown = useModulesKnown();
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [seen, setSeen] = useState(readSeen);

  const load = useCallback(async () => {
    // Until the module list is in, a switched-off module's count would only be refused.
    if (!modulesKnown) return;
    const allowed = SOURCES.filter(
      (source) =>
        hasPermission(permissions, source.permission) && !(source.module && offModules.includes(source.module)),
    );
    // A source that fails (no permission after all, backend hiccup) is left out rather than failing the bell.
    const counts = await Promise.all(allowed.map((source) => source.count().catch(() => 0)));
    setNotices(allowed.map((source, i) => ({ source, count: counts[i] })).filter((notice) => notice.count > 0));
  }, [permissions, offModules, modulesKnown]);

  useEffect(() => {
    // A hidden tab stops asking; it catches up the moment it is shown again.
    const refresh = () => {
      if (!document.hidden) void load();
    };
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const current = notices ? signature(notices) : "";
  const hasNew = Boolean(notices?.length) && current !== seen;

  const markSeen = () => {
    setSeen(current);
    try {
      localStorage.setItem(SEEN_KEY, current);
    } catch {
      // storage unavailable: the dot simply comes back after a reload
    }
  };

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) return;
        markSeen();
        void load();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon-lg"
          aria-label={hasNew ? "Notifications (new)" : "Notifications"}
          className="rounded-[10px] text-gray-700 shadow-xs hover:bg-muted dark:hover:bg-accent dark:border-input dark:text-muted-foreground"
        >
          <BellIcon className="size-5" />
          {hasNew && (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500 ring ring-background" />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        collisionPadding={16}
        className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl"
      >
        <DropdownMenuLabel className="border-b border-gray-200 px-4 py-4 text-lg font-semibold text-gray-800 dark:border-border dark:text-white/90">
          Notifications
        </DropdownMenuLabel>

        {/* Fixed height so the panel does not jump as counts load or change; shorter only when the screen is. */}
        <div className="h-80 max-h-[calc(var(--radix-dropdown-menu-content-available-height)-5rem)] overflow-y-auto">
          {notices === null ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : notices.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              You're all caught up. Nothing is waiting for you.
            </p>
          ) : (
            notices.map(({ source, count }) => (
              <DropdownMenuItem
                key={source.key}
                onClick={() => navigate(source.to)}
                className="flex cursor-pointer items-start gap-3 px-3 py-3"
              >
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <source.icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{count === 1 ? source.one : source.many(count)}</span>
                  <span className="block text-xs text-muted-foreground">{source.hint}</span>
                </span>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
