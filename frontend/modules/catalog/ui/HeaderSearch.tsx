"use client";

import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/photo";
import { searchByKind, shopListing, type ProductKind, type SearchEntry } from "@/lib/product";
import { useClickOutside } from "@/lib/useClickOutside";
import { useSearchIndex } from "./useSearchIndex";

const RESULTS_PER_KIND = 4;

const GROUPS = [
  { kind: "stock", titleKey: "kindStockItems", viewAllKey: "searchViewAllStock" },
  { kind: "preorder", titleKey: "kindPreorderItems", viewAllKey: "searchViewAllPreorder" },
] as const;

/** State shared by the desktop and mobile header search: query, live results and submit-to-shop. */
export function useHeaderSearch() {
  const router = useRouter();
  const { entries, load } = useSearchIndex();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useClickOutside(containerRef, () => setIsFocused(false));

  const results = useMemo(() => searchByKind(entries, query, RESULTS_PER_KIND), [entries, query]);
  const close = () => setIsFocused(false);
  const open = isFocused && results.stock.length + results.preorder.length > 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      close();
      // One listing per shop: Enter opens the stock one unless only pre-order items match.
      const kind = results.stock.length === 0 && results.preorder.length > 0 ? "preorder" : "stock";
      router.push(shopListing(kind, { q: trimmed }));
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
  results: Record<ProductKind, SearchEntry[]>;
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
      {GROUPS.filter((group) => results[group.kind].length > 0).map((group) => (
        <section key={group.kind}>
          <h3 className="px-3 py-2 text-2xs font-bold uppercase tracking-wider text-fg-muted">
            {ui(group.titleKey)} ({results[group.kind].length})
          </h3>
          {results[group.kind].map((product) => (
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
          <div className="px-3 pb-2 pt-1 text-center">
            <Link
              href={shopListing(group.kind, { q: query.trim() })}
              onClick={onNavigate}
              className="flex cursor-pointer items-center justify-center gap-1 text-xs font-bold text-gold-800 hover:text-gold-900"
            >
              <span>{ui(group.viewAllKey)}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      ))}
    </div>
  );
}
