"use client";

import { Dropdown } from "@/design-system/patterns/Dropdown";

interface FilterDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  /** "right" hangs the menu from the trigger's right edge; "stretch" matches the trigger's width. */
  menuAlign?: "stretch" | "right";
}

const FILTER_TRIGGER_CLASS =
  "shadow-xs flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-2.5 text-xs font-bold text-ink-900 transition-colors hover:border-gold-500 focus:border-gold-500 focus:bg-white";

/** The compact sort/filter dropdown used on the shop and pre-order pages. */
export function FilterDropdown({ value, onChange, options, className, menuAlign = "right" }: FilterDropdownProps) {
  return (
    <Dropdown
      value={value}
      onChange={onChange}
      options={options}
      className={className}
      triggerClassName={FILTER_TRIGGER_CLASS}
      menuAlign={menuAlign}
    />
  );
}
