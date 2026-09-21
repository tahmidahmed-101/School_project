"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Star, ArrowRight } from "lucide-react";
import { PRODUCTS } from "../lib/data";
import { useLang } from "../lib/i18n";
import { photo } from "../lib/photo";
import { useOverlay } from "../lib/useOverlay";
import { searchProducts } from "../lib/product";

interface QuickSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuickSearch({ isOpen, onClose }: QuickSearchProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { t, ui, money, n } = useLang();

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useOverlay(isOpen, onClose);

  const filteredProducts = useMemo(
    () => searchProducts(PRODUCTS, query, 6, { includeDescription: true }),
    [query],
  );

  const quickTags = [
    { label: "Earbuds", query: "earbuds" },
    { label: "Power bank", query: "power bank" },
    { label: "Tank top", query: "tank" },
    { label: "Hobo bag", query: "hobo" },
    { label: "Cuff", query: "cuff" },
    { label: "Backpack", query: "backpack" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto p-0 sm:p-6 md:p-20">
          {/* Backdrop with fade animation */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="backdrop-blur-xs fixed inset-0 cursor-default bg-ink-900/50"
            aria-label="Close search modal"
          />

          {/* Dialog Box with scale & slide animation */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-full space-y-4 self-start rounded-none border-b border-ink-200 bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-2xl sm:border"
          >
            {/* Search Input Row */}
            <div className="relative flex items-center border-b border-ink-200 pb-4">
              <Search className="ml-1 h-5 w-5 shrink-0 text-gold-500" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={ui("searchPlaceholderShort")}
                className="w-full bg-transparent px-3 py-1 text-base text-ink-900 placeholder-ink-400 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="cursor-pointer p-1 text-ink-400 hover:text-ink-900"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="ml-2 cursor-pointer rounded-md bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700 transition-colors hover:bg-ink-200"
              >
                Esc
              </button>
            </div>

            {/* Quick Tag Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs font-semibold text-ink-500">{ui("trendingNow")}:</span>
              {quickTags.map((tag, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setQuery(tag.query)}
                  className="cursor-pointer rounded-full border border-ink-200 bg-ink-100 px-2.5 py-1 text-xs text-ink-700 transition-colors hover:border-gold-300 hover:bg-gold-50 hover:text-gold-800"
                >
                  {tag.label}
                </button>
              ))}
            </div>

            {/* Search Results List */}
            <div className="max-h-[380px] space-y-2 overflow-y-auto pt-2">
              {query.trim() && filteredProducts.length === 0 && (
                <div className="py-8 text-center text-xs text-ink-500">
                  {ui("noProductsFound")}
                </div>
              )}

              {filteredProducts.map((product) => (
                <Link
                  key={product.id}
                  href={`/product/${product.slug}`}
                  onClick={onClose}
                  className="group flex items-center gap-3.5 rounded-xl border border-transparent p-2.5 transition-colors hover:border-ink-200 hover:bg-ink-50"
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-ink-200 bg-ink-100">
                    <Image
                      src={photo(product.image)}
                      alt={t(product.name)}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold text-ink-900 transition-colors group-hover:text-gold-600">
                      {t(product.name)}
                    </div>
                    <div className="truncate text-[11px] text-ink-500">
                      {t(product.categoryName)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs font-bold text-gold-600">{money(product.price)}</div>
                    {product.reviewCount > 0 && (
                      <div className="flex items-center justify-end gap-1 text-[10px] text-ink-500">
                        <Star className="h-2.5 w-2.5 fill-gold-500 text-gold-500" />
                        <span>{n(product.rating)}</span>
                      </div>
                    )}
                  </div>

                  <ArrowRight className="h-4 w-4 text-ink-400 transition-all group-hover:translate-x-0.5 group-hover:text-gold-600" />
                </Link>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
