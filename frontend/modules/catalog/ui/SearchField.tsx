"use client";

import { Search, X } from "lucide-react";
import { INPUT_SKIN } from "@/design-system/ui/FormField";
import { useLang } from "@/lib/i18n";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}

/** Text input with a leading search icon and a clear button once there is a value. */
export function SearchField({ value, onChange, placeholder, className = "" }: SearchFieldProps) {
  const { ui } = useLang();
  return (
    <div className={`relative flex items-center ${className}`}>
      <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink-500" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${INPUT_SKIN} py-2.5 pl-10 pr-9`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3 cursor-pointer p-1 text-ink-600 hover:text-ink-900"
          aria-label={ui("clearSearch")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
