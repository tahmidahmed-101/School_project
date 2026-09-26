"use client";

import type { CategoryInfo } from "../lib/types";
import { useLang } from "../lib/i18n";

interface PreOrderCategoryTabsProps {
  categories: CategoryInfo[];
  value: string;
  onChange: (id: string) => void;
}

const tabClass = (active: boolean) =>
  `shrink-0 whitespace-nowrap border-b-2 py-2.5 text-xs font-bold tracking-wide transition-colors sm:text-sm ${
    active ? "border-gold-600 text-gold-600" : "border-transparent text-ink-500 hover:text-ink-800"
  }`;

/** Underline-style category filter under the pre-order section header; no fill on the tabs themselves. */
export function PreOrderCategoryTabs({ categories, value, onChange }: PreOrderCategoryTabsProps) {
  const { t, ui } = useLang();

  return (
    <div
      role="tablist"
      aria-label={ui("navPreOrder")}
      className="mb-6 flex gap-5 overflow-x-auto border-b border-ink-200 sm:mb-8 sm:gap-8"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === "all"}
        onClick={() => onChange("all")}
        className={tabClass(value === "all")}
      >
        {ui("filterAllCollections")}
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          role="tab"
          aria-selected={value === category.id}
          onClick={() => onChange(category.id)}
          className={tabClass(value === category.id)}
        >
          {t(category.name)}
        </button>
      ))}
    </div>
  );
}
