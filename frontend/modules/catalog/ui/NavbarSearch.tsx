"use client";

import { Search } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { buttonClass } from "@/design-system/ui/Button";
import { HEADER_SEARCH_INPUT_CLASS, SearchSuggestions, useHeaderSearch } from "./HeaderSearch";

/** Desktop header search box with a live results popup. */
export function NavbarSearch() {
  const { ui } = useLang();
  const { containerRef, query, results, open, close, listId, handleSubmit, inputProps } = useHeaderSearch();

  return (
    <div ref={containerRef} className="relative hidden max-w-2xl flex-1 lg:flex">
      <form onSubmit={handleSubmit} className="relative flex w-full items-center">
        <div className="relative w-full">
          <input
            {...inputProps}
            placeholder={ui("searchPlaceholder")}
            aria-label={ui("searchProducts")}
            className={`${HEADER_SEARCH_INPUT_CLASS} pl-11 pr-28`}
          />
          <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-ink-400" />
        </div>
        <button type="submit" className={buttonClass({ size: "sm", className: "absolute right-1 top-1" })}>
          {ui("navSearch")}
        </button>
      </form>

      <SearchSuggestions id={listId} open={open} query={query} results={results} onNavigate={close} />
    </div>
  );
}
