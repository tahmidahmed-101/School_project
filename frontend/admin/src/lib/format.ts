import { format as formatFns, isValid } from "date-fns"

type DateInput = string | number | Date | null | undefined

const currencyFormatters = new Map<string, Intl.NumberFormat>()

function getCurrencyFormatter(currency: string): Intl.NumberFormat {
  let fmt = currencyFormatters.get(currency)
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    } catch {
      // Unknown/invalid ISO code from the API — fall back to USD rather than throwing in render.
      fmt = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    }
    currencyFormatters.set(currency, fmt)
  }
  return fmt
}

// Store currency; kull-mart prices are BDT. Overridden from the business profile
// (/admin/settings/business-profile/ currency_code) once settings load.
let defaultCurrency = "BDT"

export function setDefaultCurrency(code: string | null | undefined): void {
  if (code) defaultCurrency = code.toUpperCase()
}

export function getDefaultCurrency(): string {
  return defaultCurrency
}

/**
 * Formats a money value (number or decimal string from the API) as e.g. "৳1,234.56".
 * null/undefined/non-numeric values render as 0.00.
 */
export function formatCurrency(value: number | string | null | undefined, currency?: string): string {
  const n = typeof value === "number" ? value : Number(value ?? 0)
  return getCurrencyFormatter(currency || defaultCurrency).format(Number.isFinite(n) ? n : 0)
}

// "YYYY-MM-DD" or "YYYY-MM" (month periods from analytics endpoints).
const DATE_ONLY = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/

/**
 * Parses a date input. Date-only "YYYY-MM-DD" / "YYYY-MM" strings are treated as LOCAL dates
 * (`new Date("2024-01-05")` would be UTC midnight and show the previous day west of UTC).
 */
export function parseDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null
  if (value instanceof Date) return isValid(value) ? value : null
  if (typeof value === "string") {
    const m = DATE_ONLY.exec(value.trim())
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1)
      return isValid(d) ? d : null
    }
  }
  const d = new Date(value)
  return isValid(d) ? d : null
}

/** Localized date, e.g. "1/5/2024". Returns "—" for empty/invalid input. */
export function formatDate(value: DateInput, fallback = "—"): string {
  const d = parseDate(value)
  return d ? d.toLocaleDateString() : fallback
}

/** Localized date + time, e.g. "1/5/2024, 3:04:05 PM". Returns "—" for empty/invalid input. */
export function formatDateTime(value: DateInput, fallback = "—"): string {
  const d = parseDate(value)
  return d ? d.toLocaleString() : fallback
}

/** Today's date in the user's local timezone as "YYYY-MM-DD". */
export function todayLocalISODate(): string {
  return formatFns(new Date(), "yyyy-MM-dd")
}

/** UTC ISO string → local "yyyy-MM-dd'T'HH:mm" for <input type="datetime-local">. */
export function toDatetimeLocal(iso: string | null | undefined): string {
  const d = parseDate(iso)
  return d ? formatFns(d, "yyyy-MM-dd'T'HH:mm") : ""
}

/** Value of <input type="datetime-local"> (local time) → UTC ISO string; "" → null. */
export function fromDatetimeLocal(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  return isValid(d) ? d.toISOString() : null
}

/** "partially_refunded" → "partially refunded" (replaces ALL underscores). */
export function humanize(status: string | null | undefined): string {
  return (status ?? "").replace(/_/g, " ")
}
