"use client";

import { Search } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { HEADER_SEARCH_INPUT_CLASS, SearchSuggestions, useHeaderSearch } from "./HeaderSearch";

/** Full-width product search row shown under the header on mobile. */
export function MobileSearchBar() {
  const { ui } = useLang();
  const { containerRef, query, results, open, close, listId, handleSubmit, inputProps } = useHeaderSearch();

  return (
    <div ref={containerRef} className="relative w-full lg:hidden">
      <form onSubmit={handleSubmit} className="relative flex w-full items-center">
        <input
          {...inputProps}
          placeholder={ui("searchPlaceholder")}
          aria-label={ui("searchProducts")}
          className={`${HEADER_SEARCH_INPUT_CLASS} pl-4 pr-12`}
        />
        <button
          type="submit"
          aria-label={ui("navSearch")}
          className="absolute right-1 top-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-gold-500 text-ink-950 transition-colors hover:bg-gold-400"
        >
          <Search className="h-4 w-4" />
        </button>
      </form>

      <SearchSuggestions id={listId} open={open} query={query} results={results} onNavigate={close} />
    </div>
  );
}
