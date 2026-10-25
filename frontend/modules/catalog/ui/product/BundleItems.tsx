"use client";

import Image from "next/image";
import Link from "next/link";
import type { BundleItem } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/photo";

/** The items a combo is made of, with what each would cost bought on its own. */
export function BundleItems({ items }: { items: BundleItem[] }) {
  const { t, ui, n, money } = useLang();

  return (
    <div className="mb-3 mt-3 overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-left text-sm sm:text-base">
        <thead className="bg-surface text-xs font-bold uppercase tracking-wide text-fg-muted sm:text-sm">
          <tr>
            <th scope="col" className="px-3 py-2.5">
              {ui("bundleItem")}
            </th>
            <th scope="col" className="px-3 py-2.5 text-center">
              {ui("bundleQuantity")}
            </th>
            <th scope="col" className="px-3 py-2.5 text-right">
              {ui("bundlePrice")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {items.map((item) => (
            <tr key={item.slug}>
              <td className="px-3 py-2.5">
                <Link href={`/product/${item.slug}`} className="group flex items-center gap-3">
                  <span className="relative block h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-ink-100 bg-surface">
                    <Image src={photo(item.image)} alt={t(item.name)} fill sizes="48px" className="object-cover" />
                  </span>
                  {/* A long name wraps onto more lines (even a single long word) instead of widening the table. */}
                  <span className="min-w-0 font-bold leading-snug text-fg transition-colors wrap-anywhere group-hover:text-gold-800">
                    {t(item.name)}
                  </span>
                </Link>
              </td>
              <td className="px-3 py-2.5 text-center text-fg-muted">× {n(item.quantity)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-fg">
                {money(item.unitPrice * item.quantity)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
