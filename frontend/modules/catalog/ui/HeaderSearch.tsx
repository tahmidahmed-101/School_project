"use client";

import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/photo";
import { searchProducts, shopListing, type SearchEntry } from "@/lib/product";
import { useClickOutside } from "@/lib/useClickOutside";
import { useSearchIndex } from "./useSearchIndex";

const RESULT_COUNT = 4;

/** State shared by the desktop and mobile header search: query, live results and submit-to-shop. */
export function useHeaderSearch() {
  const router = useRouter();
  const { entries, load } = useSearchIndex();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useClickOutside(containerRef, () => setIsFocused(false));

  const results = useMemo(() => searchProducts(entries, query, RESULT_COUNT), [entries, query]);
  const close = () => setIsFocused(false);
  const open = isFocused && results.length > 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      close();
      router.push(shopListing({ q: trimmed }));
    }
  };

  const inputProps = {
    type: "text",
    role: "combobox",
    "aria-autocomplete": "list",
    "aria-expanded": open,
    "aria-controls": listId,
    value: query,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
    onFocus: () => {
      setIsFocused(true);
      load();
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") close();
    },
  } as const;

  return { containerRef, query, results, open, close, listId, handleSubmit, inputProps };
}

export const HEADER_SEARCH_INPUT_CLASS =
  "focus:outline-hidden focus:ring-3 h-11 w-full rounded-full border border-transparent bg-canvas text-sm text-fg transition-all placeholder:text-fg-subtle focus:border-gold-500 focus:ring-gold-500/10";

interface SearchSuggestionsProps {
  id: string;
  open: boolean;
  query: string;
  results: SearchEntry[];
  onNavigate: () => void;
}

/** Live results popup under a header search box. */
export function SearchSuggestions({ id, open, query, results, onNavigate }: SearchSuggestionsProps) {
  const { t, ui, money } = useLang();
  if (!open) return null;

  return (
    <div
      id={id}
      className="animate-in fade-in slide-in-from-top-2 absolute left-0 right-0 top-full z-50 mt-2 divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-canvas p-2 shadow-2xl"
    >
      <div className="px-3 py-2 text-2xs font-bold uppercase tracking-wider text-fg-muted">
        {ui("matchingProducts")} ({results.length})
      </div>
      {results.map((product) => (
        <Link
          key={product.id}
          href={`/product/${product.slug}`}
          onClick={onNavigate}
          className="flex cursor-pointer items-center gap-3 rounded-xl p-2 transition-colors hover:bg-surface"
        >
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-ink-200 bg-surface-muted">
            <Image src={photo(product.image)} alt={t(product.name)} fill sizes="48px" className="object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-fg">{t(product.name)}</p>
            <p className="text-2xs font-medium text-gold-800">{t(product.categoryName)}</p>
          </div>
          <span className="text-xs font-bold text-fg">{money(product.price)}</span>
        </Link>
      ))}
      <div className="px-3 pb-1 pt-2 text-center">
        <Link
          href={shopListing({ q: query.trim() })}
          onClick={onNavigate}
          className="flex cursor-pointer items-center justify-center gap-1 text-xs font-bold text-gold-800 hover:text-gold-900"
        >
          <span>{ui("viewAllResults")}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
