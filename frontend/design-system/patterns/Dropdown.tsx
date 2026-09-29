"use client";

import { useRef, useState } from "react";
import { ChevronDown, Check, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useClickOutside } from "@/lib/useClickOutside";

interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  className?: string;
  searchable?: boolean;
  placeholder?: string;
  triggerClassName?: string;
  /** "stretch" spans the trigger's width; "right" hangs from its right edge with a min width. */
  menuAlign?: "stretch" | "right";
}

const defaultTriggerClass =
  "flex w-full items-center justify-between rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-900 transition-colors hover:border-ink-300 focus:border-gold-500 focus:bg-white focus:outline-none";

const searchInputClass =
  "w-full rounded-xl border border-ink-200 bg-ink-50 py-3 pl-4 pr-9 text-sm text-ink-900 placeholder-ink-400 focus:border-gold-500 focus:bg-white focus:outline-none";

const MENU_ALIGN = {
  stretch: "left-0 right-0 origin-top",
  right: "right-0 min-w-[160px] origin-top-right",
} as const;

export function Dropdown({
  value,
  onChange,
  options,
  className = "",
  searchable = false,
  placeholder = "Select",
  triggerClassName,
  menuAlign = "stretch",
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useClickOutside(containerRef, () => {
    setIsOpen(false);
    setQuery("");
  });

  const visibleOptions =
    searchable && query
      ? options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()))
      : options;

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setQuery("");
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {searchable ? (
        <div className="relative">
          <input
            type="text"
            value={isOpen ? query : (selected?.label ?? "")}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder={placeholder}
            className={triggerClassName ?? searchInputClass}
          />
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          className={triggerClassName ?? defaultTriggerClass}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-ink-500 transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={`absolute top-full z-50 mt-1.5 overflow-y-auto rounded-xl border border-ink-200 bg-white p-1.5 shadow-xl ${MENU_ALIGN[menuAlign]} ${
              searchable ? "max-h-56" : "max-h-64"
            }`}
          >
            {visibleOptions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-ink-400">No matches found</p>
            ) : (
              visibleOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                    option.value === value
                      ? "bg-gold-50 font-semibold text-gold-900"
                      : "text-ink-700 hover:bg-ink-100 hover:text-ink-950"
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {option.value === value && <Check className="h-3.5 w-3.5 shrink-0 text-gold-600" />}
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
