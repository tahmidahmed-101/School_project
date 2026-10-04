"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ApiCustomerOrder, ApiPage } from "@/lib/api/types";
import { useLang } from "@/lib/i18n";
import { Loader } from "@/design-system/patterns/Loader";
import { useAuth } from "../context";
import { humanizeStatus, orderStatusKey, orderStatusTone, variantLabel } from "../domain/orders";

const PAGE_SIZE = 5;

const TONE_CLASS = {
  done: "bg-brand-800/10 text-brand-800",
  bad: "bg-danger-surface text-danger",
  progress: "bg-gold-100 text-gold-800",
} as const;

/** The logged-in customer's past orders, newest first, on the account page. */
export function OrderHistory() {
  const { lang, ui, n, money } = useLang();
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
    authRequest<ApiPage<ApiCustomerOrder>>("/orders/", { query: { page, page_size: PAGE_SIZE } })
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
  }, [authRequest, page, attempt]);

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  const linkClass = "cursor-pointer text-xs font-bold text-gold-800 hover:text-gold-900 hover:underline";

  return (
    <section aria-labelledby="orders-heading" className="mt-8">
      <h2 id="orders-heading" className="ts-display mb-3 text-lg font-extrabold text-gold-700">
        {ui("ordersTitle")}
      </h2>

      {orders.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {orders.map((order) => {
            const statusKey = orderStatusKey(order.status);
            return (
              <li key={order.id} className="shadow-xs flex flex-col rounded-2xl border border-ink-200 bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-fg">{order.order_number}</p>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-2xs font-bold ${TONE_CLASS[orderStatusTone(order.status)]}`}
                  >
                    {statusKey ? ui(statusKey) : humanizeStatus(order.status)}
                  </span>
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
                        {variantLabel(line) && <span className="text-fg-muted"> · {variantLabel(line)}</span>}
                      </span>
                      <span className="shrink-0 text-fg-muted">× {n(line.quantity)}</span>
                    </li>
                  ))}
                </ul>

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

      {!loading && !failed && orders.length === 0 && <p className="text-xs text-fg-muted">{ui("ordersEmpty")}</p>}

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
    </section>
  );
}
