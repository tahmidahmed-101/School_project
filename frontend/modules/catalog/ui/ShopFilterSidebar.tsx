"use client";

import { X, Filter } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useOverlay } from "@/lib/useOverlay";
import { countActiveFilters, type FilterChange, type FilterState } from "../domain/shop-filters";
import { ScrollReveal } from "@/design-system/patterns/Reveal";
import { ShopFilterControls } from "./ShopFilterControls";
import { SLIDE_EASE, usePresence } from "@/design-system/patterns/usePresence";

interface ShopFilterSidebarProps {
  filters: FilterState;
  onFilterChange: FilterChange;
  onReset: () => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  productCount: number;
}

export function ShopFilterSidebar({
  filters,
  onFilterChange,
  onReset,
  isMobileOpen = false,
  onMobileClose,
  productCount,
}: ShopFilterSidebarProps) {
  const { ui, n } = useLang();

  useOverlay(isMobileOpen);

  const hasActiveFilters = countActiveFilters(filters) > 0;

  const { mounted, shown } = usePresence(isMobileOpen, 300);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-[140px] z-20 hidden w-72 shrink-0 self-start lg:block">
        <ScrollReveal y={20} duration={0.7}>
          <div className="shadow-xs max-h-[calc(100vh-165px)] space-y-6 overflow-y-auto rounded-2xl border border-ink-200/80 bg-white p-5 text-xs text-ink-900 sm:p-6">
            <div className="flex items-center justify-between border-b border-ink-200 pb-3.5">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gold-600" />
                <h4 className="ts-display text-sm font-bold tracking-wider text-ink-900">{ui("filterCatalog")}</h4>
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={onReset}
                  className="cursor-pointer text-xs font-bold text-ink-500 transition-colors hover:text-gold-800"
                >
                  {ui("resetFilters")}
                </button>
              )}
            </div>

            <ShopFilterControls filters={filters} onFilterChange={onFilterChange} />
          </div>
        </ScrollReveal>
      </aside>

      {/* Mobile filter drawer */}
      <>
        {mounted && (
          <div className="pointer-events-none fixed inset-0 z-50 flex justify-end lg:hidden">
            <button
              type="button"
              className={`pointer-events-auto backdrop-blur-xs fixed inset-0 cursor-default bg-ink-900/60 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`}
              onClick={onMobileClose}
              aria-label="Close filters"
            />

            <div
              className={`pointer-events-auto relative z-10 flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:max-w-md transition-transform duration-300 ${SLIDE_EASE} ${shown ? "translate-x-0" : "translate-x-full"}`}
            >
              <div className="flex items-center justify-between border-b border-ink-200 bg-white p-5">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gold-600" />
                  <h3 className="ts-display text-base font-bold tracking-wider text-ink-900">{ui("filterCatalog")}</h3>
                </div>
                <button
                  type="button"
                  onClick={onMobileClose}
                  className="cursor-pointer rounded-lg bg-ink-100 p-1.5 text-ink-500 transition-colors hover:text-ink-900"
                  aria-label="Close filters"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto bg-white p-5">
                <ShopFilterControls filters={filters} onFilterChange={onFilterChange} />
              </div>

              <div className="flex gap-3 border-t border-ink-200 bg-ink-50 p-4 sm:p-5">
                <button
                  type="button"
                  onClick={onReset}
                  className="flex-1 cursor-pointer rounded-full border border-ink-300 bg-white py-3 text-xs font-bold tracking-wider text-ink-800 transition-colors hover:bg-ink-100"
                >
                  {ui("filterClearShort")}
                </button>
                <button
                  type="button"
                  onClick={onMobileClose}
                  className="flex-1 cursor-pointer rounded-full bg-gold-500 py-3 text-xs font-bold tracking-wider text-ink-950 shadow-md transition-colors hover:bg-gold-400"
                >
                  {ui("showProducts")} ({n(productCount)})
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    </>
  );
}
