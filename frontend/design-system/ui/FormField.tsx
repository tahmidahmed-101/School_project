import type { ReactNode } from "react";

const INPUT_SHAPE =
  "w-full rounded-xl border text-sm text-fg placeholder-ink-400 transition-colors focus:border-gold-500 focus:outline-none";
const INPUT_OK = "border-ink-200 bg-card";

/** Input look without padding, for controls that place their own icons (search fields). */
export const INPUT_SKIN = `${INPUT_SHAPE} ${INPUT_OK}`;

export const INPUT_CLASS = `${INPUT_SKIN} px-4 py-3`;

/** The one text-input style; pass `invalid` to switch it to the error treatment. */
export function inputClass({ invalid = false, padding = "px-4 py-3", className = "" } = {}) {
  return [INPUT_SHAPE, invalid ? "border-danger bg-danger-surface" : INPUT_OK, padding, className]
    .filter(Boolean)
    .join(" ");
}

interface FormFieldProps {
  /** Id of the control the label points at. */
  htmlFor: string;
  label: string;
  required?: boolean;
  /** Message shown under the control (validation from the form or the API). */
  error?: string;
  children: ReactNode;
}

/** Label + control pair used by every storefront form. */
export function FormField({ htmlFor, label, required = false, error, children }: FormFieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-fg">
        {label}
        {required && " *"}
      </label>
      {children}
      {error && <FieldError id={`${htmlFor}-error`}>{error}</FieldError>}
    </div>
  );
}

/** One-line validation message under a control. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-1 text-[11px] font-semibold text-danger">
      {children}
    </p>
  );
}

/** Form-level error banner (submit failed, API rejected the request). */
export function FormAlert({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={`rounded-xl border border-danger-line bg-danger-surface p-3 text-xs font-semibold text-danger ${className}`}
    >
      {children}
    </div>
  );
}
