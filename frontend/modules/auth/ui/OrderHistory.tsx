"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ApiCustomerOrder, ApiPage } from "@/lib/api/types";
import { useLang } from "@/lib/i18n";
import { preorderStageLabel } from "@/lib/preorder-stages";
import { Loader } from "@/design-system/patterns/Loader";
import { useAuth } from "../context";
import { humanizeStatus, orderStatusKey, orderStatusTone, preorderStageTone } from "../domain/orders";
import { cardClass } from "@/design-system/ui/Card";

const PAGE_SIZE = 5;

const TONE_CLASS = {
  done: "bg-brand-800/10 text-brand-800",
  bad: "bg-danger-surface text-danger",
  progress: "bg-gold-100 text-gold-800",
} as const;

type OrderKind = ApiCustomerOrder["order_type"];

const TABS = [
  { kind: "stock", labelKey: "ordersTabStock", emptyKey: "ordersEmpty" },
  { kind: "preorder", labelKey: "ordersTabPreorder", emptyKey: "ordersPreorderEmpty" },
] as const;

const tabClass = (active: boolean) =>
  `shrink-0 cursor-pointer whitespace-nowrap border-b-2 py-2.5 text-xs font-bold tracking-wide transition-colors sm:text-sm ${
    active ? "border-gold-600 text-gold-800" : "border-transparent text-fg-subtle hover:text-ink-800"
  }`;

/** The logged-in customer's past orders on the account page: stock orders and pre-orders are separate lists. */
export function OrderHistory() {
  const { ui } = useLang();
  const [kind, setKind] = useState<OrderKind>("stock");
  const active = TABS.find((tab) => tab.kind === kind)!;

  return (
    <section aria-labelledby="orders-heading" className="mt-8">
      <h2 id="orders-heading" className="ts-display mb-3 text-lg font-extrabold text-gold-700">
        {ui("ordersTitle")}
      </h2>
      <div role="tablist" aria-labelledby="orders-heading" className="mb-4 flex gap-5 border-b border-ink-200 sm:gap-8">
        {TABS.map((tab) => (
          <button
            key={tab.kind}
            type="button"
            role="tab"
            aria-selected={tab.kind === kind}
            onClick={() => setKind(tab.kind)}
            className={tabClass(tab.kind === kind)}
          >
            {ui(tab.labelKey)}
          </button>
        ))}
      </div>
      <OrderList key={kind} kind={kind} emptyKey={active.emptyKey} />
    </section>
  );
}

function OrderList({ kind, emptyKey }: { kind: OrderKind; emptyKey: (typeof TABS)[number]["emptyKey"] }) {
  const { lang, t, ui, n, money } = useLang();
  const { authRequest } = useAuth();
  const [orders, setOrders] = useState<ApiCustomerOrder[]>([]);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    authRequest<ApiPage<ApiCustomerOrder>>("/orders/", { query: { page, page_size: PAGE_SIZE, order_type: kind } })
      .then((data) => {
        if (cancelled) return;
        // Keyed merge: a re-run effect (Strict Mode, retry) cannot list an order twice.
        setOrders((prev) => {
          const seen = new Set(prev.map((o) => o.id));
          return [...prev, ...data.results.filter((o) => !seen.has(o.id))];
        });
        setHasMore(Boolean(data.next));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authRequest, page, attempt, kind]);

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  const linkClass = "cursor-pointer text-xs font-bold text-gold-800 hover:text-gold-900 hover:underline";

  return (
    <div role="tabpanel">
      {orders.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {orders.map((order) => {
            const statusKey = orderStatusKey(order.status);
            const stage = order.status === "cancelled" ? "cancelled" : order.preorder_stage;
            return (
              <li key={order.id} className={cardClass("surface", "shadow-xs flex flex-col p-4")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-fg">{order.order_number}</p>
                  {kind === "stock" ? (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-2xs font-bold ${TONE_CLASS[orderStatusTone(order.status)]}`}
                    >
                      {statusKey ? ui(statusKey) : humanizeStatus(order.status)}
                    </span>
                  ) : (
                    stage && (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-2xs font-bold ${TONE_CLASS[preorderStageTone(stage)]}`}
                      >
                        {t(preorderStageLabel(stage))}
                      </span>
                    )
                  )}
                </div>
                <p className="mt-0.5 text-xs text-fg-muted">{date(order.created_at)}</p>

                <ul className="mb-3 mt-3 space-y-1.5 border-t border-ink-100 pt-3 text-xs">
                  {order.lines.map((line) => (
                    <li key={line.id} className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <Link
                          href={`/product/${line.product_slug}`}
                          prefetch={false}
                          className="font-semibold text-fg hover:text-gold-800 hover:underline"
                        >
                          {line.product_name}
                        </Link>
                        {line.variant_title && <span className="text-fg-muted"> · {line.variant_title}</span>}
                      </span>
                      <span className="shrink-0 text-fg-muted">× {n(line.quantity)}</span>
                    </li>
                  ))}
                </ul>

                {kind === "preorder" && (
                  <dl className="mb-3 grid grid-cols-3 gap-2 border-t border-ink-100 pt-3 text-2xs">
                    {(
                      [
                        ["preorderAdvance", order.deposit_due],
                        ["preorderPaid", order.paid_total],
                        ["preorderBalanceDue", order.balance_due],
                      ] as const
                    ).map(([labelKey, amount]) => (
                      <div key={labelKey}>
                        <dt className="text-fg-muted">{ui(labelKey)}</dt>
                        <dd className="font-bold text-fg">{money(Number(amount))}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                <div className="mt-auto flex items-center justify-between gap-3 border-t border-ink-100 pt-3 text-xs">
                  <span className="text-fg-muted">
                    {ui("ordersTotal")}: <strong className="text-fg">{money(Number(order.grand_total))}</strong>
                  </span>
                  <Link href="/track-order" prefetch={false} className={linkClass}>
                    {ui("ordersTrack")}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && !failed && orders.length === 0 && <p className="text-xs text-fg-muted">{ui(emptyKey)}</p>}

      <div className="mt-3">
        {loading ? (
          <div role="status" className="flex items-center gap-2 text-xs text-fg-muted">
            <Loader variant="inline" />
            <span>{ui("loading")}</span>
          </div>
        ) : failed ? (
          <p className="text-xs text-fg-muted">
            {ui("loadFailed")}{" "}
            <button type="button" onClick={() => setAttempt((a) => a + 1)} className={linkClass}>
              {ui("tryAgain")}
            </button>
          </p>
        ) : (
          hasMore && (
            <button type="button" onClick={() => setPage((p) => p + 1)} className={linkClass}>
              {ui("loadMore")}
            </button>
          )
        )}
      </div>
    </div>
  );
}
