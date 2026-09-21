"use client";

import { Search, X } from "lucide-react";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}

/** Text input with a leading search icon and a clear button once there is a value. */
export function SearchField({ value, onChange, placeholder, className = "" }: SearchFieldProps) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-ink-200 bg-ink-50 py-2.5 pl-10 pr-8 text-xs text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-gold-500 focus:bg-white"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3 cursor-pointer p-1 text-ink-400 hover:text-ink-900"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
