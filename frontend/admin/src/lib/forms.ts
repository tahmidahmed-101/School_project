import { toast } from "sonner"
import { z } from "zod"
import type { FieldPath, FieldValues, UseFormSetError } from "react-hook-form"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { AMOUNT_PATTERN } from "@/lib/money"

/**
 * Reports a failed save: maps the backend's field errors onto the form (only for fields the
 * form has, optionally renamed via `fieldMap`) and toasts the overall message.
 */
export function reportFormError<T extends FieldValues>(
  err: unknown,
  {
    setError,
    fields,
    fieldMap = {},
    fallback = "Failed to save",
  }: {
    setError: UseFormSetError<T>
    fields: readonly string[]
    fieldMap?: Record<string, FieldPath<T>>
    fallback?: string
  }
) {
  for (const [field, message] of Object.entries(getApiFieldErrors(err))) {
    const target = fieldMap[field] ?? field
    if (fields.includes(target)) setError(target as FieldPath<T>, { message })
  }
  toast.error(getApiErrorMessage(err, fallback))
}

/** An amount typed into a text input: blank (optional) or a non-negative number with up to 2 decimals. */
export const moneySchema = z
  .string()
  .trim()
  .refine((v) => v === "" || AMOUNT_PATTERN.test(v), "Enter a valid amount (max 2 decimals)")
