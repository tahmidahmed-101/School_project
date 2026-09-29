import type { ReactNode } from "react";

export const INPUT_ERROR_CLASS = "border-red-400 bg-red-50/40";

export const INPUT_CLASS =
  "w-full rounded-xl border border-ink-200 bg-surface px-4 py-3 text-sm text-fg placeholder-ink-400 focus:border-gold-500 focus:bg-card focus:outline-none";

interface FormFieldProps {
  /** Id of the control the label points at. */
  htmlFor: string;
  label: string;
  required?: boolean;
  /** Message shown under the control (validation from the form or the API). */
  error?: string;
  children: ReactNode;
}

/** Label + control pair used by the checkout form. */
export function FormField({ htmlFor, label, required = false, error, children }: FormFieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-fg">
        {label}
        {required && " *"}
      </label>
      {children}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1 text-[11px] font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
