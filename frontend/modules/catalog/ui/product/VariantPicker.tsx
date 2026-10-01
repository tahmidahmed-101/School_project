"use client";

import type { Product } from "@/lib/types";
import { useLang } from "@/lib/i18n";

interface VariantPickerProps {
  variants: NonNullable<Product["variants"]>;
  selected: Record<string, string>;
  onSelect: (variantName: string, value: string) => void;
}

/** Size / option chips. Selection is keyed by the English variant name. */
export function VariantPicker({ variants, selected, onSelect }: VariantPickerProps) {
  const { t } = useLang();

  return (
    <>
      {variants.map((v) => (
        <div key={v.name.en} className="mt-7 border-t border-ink-100 pt-6">
          <div className="mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-900">
              {t(v.name)}: <span className="font-normal text-gold-800">{selected[v.name.en]}</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {v.options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onSelect(v.name.en, opt.value)}
                className={`h-11 min-w-[44px] cursor-pointer rounded-full border px-3 text-xs font-bold transition-all ${
                  selected[v.name.en] === opt.value
                    ? "shadow-xs border-brand-700 bg-brand-700 text-white"
                    : "border-ink-200 bg-white text-ink-700 hover:border-ink-400"
                } ${opt.inStock === false ? "line-through opacity-50" : ""}`}
              >
                {t(opt.label)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
