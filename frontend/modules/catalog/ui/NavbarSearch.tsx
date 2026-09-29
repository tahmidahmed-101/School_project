"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ArrowRight } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/photo";
import { searchProducts } from "@/lib/product";
import { useClickOutside } from "@/lib/useClickOutside";
import { useSearchIndex } from "./useSearchIndex";

/** Desktop header search box with a live results popup. */
export function NavbarSearch() {
  const router = useRouter();
  const { t, ui, money } = useLang();
  const { entries, load } = useSearchIndex();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setIsFocused(false));

  const results = useMemo(() => searchProducts(entries, query, 5), [entries, query]);
  const closePopup = () => setIsFocused(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      closePopup();
      router.push(`/shop?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <div ref={containerRef} className="relative hidden max-w-2xl flex-1 lg:flex">
      <form onSubmit={handleSubmit} className="relative flex w-full items-center">
        <div className="relative w-full">
          <input
            type="text"
            placeholder={ui("navSearchPlaceholder")}
            aria-label="Search products"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              setIsFocused(true);
              load();
            }}
            className="focus:outline-hidden focus:ring-3 h-11 w-full rounded-full border border-transparent bg-white pl-11 pr-28 text-sm text-ink-900 transition-all placeholder:text-ink-400 focus:border-gold-500 focus:bg-white focus:ring-gold-500/10"
          />
          <Search className="absolute left-4 top-3.5 h-4 w-4 text-ink-400" />
        </div>
        <button
          type="submit"
          className="shadow-2xs absolute bottom-1.5 right-1.5 top-1.5 cursor-pointer rounded-full bg-gold-500 px-5 text-xs font-bold uppercase tracking-wider text-ink-950 transition-colors hover:bg-gold-400"
        >
          {ui("navSearch")}
        </button>
      </form>

      {isFocused && results.length > 0 && (
        <div className="animate-in fade-in slide-in-from-top-2 absolute left-0 right-0 top-full z-50 mt-2 divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white p-2 shadow-2xl">
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-ink-400">
            {ui("matchingProducts")} ({results.length})
          </div>
          {results.map((product) => (
            <Link
              key={product.id}
              href={`/product/${product.slug}`}
              onClick={closePopup}
              className="flex cursor-pointer items-center gap-3 rounded-xl p-2 transition-colors hover:bg-ink-50"
            >
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-ink-200 bg-ink-100">
                <Image src={photo(product.image)} alt={t(product.name)} fill sizes="48px" className="object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-ink-900">{t(product.name)}</p>
                <p className="text-[11px] font-medium text-gold-600">{t(product.categoryName)}</p>
              </div>
              <span className="text-xs font-bold text-ink-900">{money(product.price)}</span>
            </Link>
          ))}
          <div className="px-3 pb-1 pt-2 text-center">
            <Link
              href={`/shop?q=${encodeURIComponent(query)}`}
              onClick={closePopup}
              className="flex cursor-pointer items-center justify-center gap-1 text-xs font-bold text-gold-600 hover:text-gold-700"
            >
              <span>{ui("viewAllResults")}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
