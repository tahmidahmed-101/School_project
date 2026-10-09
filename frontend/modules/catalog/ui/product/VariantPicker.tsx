"use client";

import type { Product } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { isValueAvailable, type OptionSelection } from "@/lib/variants";

interface VariantPickerProps {
  product: Product;
  selection: OptionSelection;
  onSelect: (optionId: string, valueId: string) => void;
}

export function VariantPicker({ product, selection, onSelect }: VariantPickerProps) {
  const { ui } = useLang();

  return (
    <>
      {(product.options ?? []).map((option) => {
        const labelId = `option-${option.id}`;
        const picked = option.values.find((value) => value.id === selection[option.id]);
        const label = (
          <span id={labelId} className="text-xs font-bold uppercase tracking-wider text-fg">
            {option.name}:{" "}
            <span className="font-normal text-gold-800">
              {option.values.length === 1 ? option.values[0]?.value : picked?.value}
            </span>
          </span>
        );

        if (option.values.length === 1) {
          return (
            <div key={option.id} className="mt-7 border-t border-ink-100 pt-6">
              {label}
            </div>
          );
        }

        return (
          <div key={option.id} role="group" aria-labelledby={labelId} className="mt-7 border-t border-ink-100 pt-6">
            <div className="mb-3">{label}</div>
            <div className="flex flex-wrap items-center gap-2.5">
              {option.values.map((value) => {
                const isPicked = picked?.id === value.id;
                const available = isPicked || isValueAvailable(product, selection, option.id, value.id);
                return (
                  <button
                    key={value.id}
                    type="button"
                    disabled={!available}
                    aria-pressed={isPicked}
                    aria-label={available ? undefined : `${value.value} (${ui("optionUnavailable")})`}
                    title={available ? undefined : ui("optionUnavailable")}
                    onClick={() => onSelect(option.id, value.id)}
                    className={`h-11 min-w-[44px] max-w-full truncate rounded-full border px-3 text-xs font-bold transition-all ${
                      isPicked
                        ? "shadow-xs border-brand-700 bg-action text-white"
                        : "border-ink-200 bg-canvas text-ink-700 hover:border-ink-400"
                    } ${available ? "cursor-pointer" : "cursor-not-allowed line-through opacity-50"}`}
                  >
                    {value.value}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
