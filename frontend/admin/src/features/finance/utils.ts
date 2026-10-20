import { sumMoney } from "@/lib/money"
import type { JournalEntry, JournalEntryKind } from "./types"

/** Entry size = sum of its debits (always equal to its credits). */
export const entryTotal = (entry: JournalEntry) => sumMoney(entry.lines.map((line) => line.debit))

/** The form and list face of `kind`: the API's blank kind is "company" here. */
export type BelongsTo = "stock" | "preorder" | "company"

export const BELONGS_TO_OPTIONS: { label: string; value: BelongsTo }[] = [
  { label: "Whole business", value: "company" },
  { label: "Stock", value: "stock" },
  { label: "Pre-order", value: "preorder" },
]

export const belongsToFromKind = (kind: JournalEntryKind): BelongsTo => kind || "company"

export const kindFromBelongsTo = (belongsTo: BelongsTo): JournalEntryKind => (belongsTo === "company" ? "" : belongsTo)

export const belongsToLabel = (kind: JournalEntryKind) =>
  BELONGS_TO_OPTIONS.find((option) => option.value === belongsToFromKind(kind))?.label ?? "Whole business"

export function kindFromImportCell(raw: string): JournalEntryKind {
  const value = raw.trim().toLowerCase().replace(/[\s_-]+/g, "")
  if (value === "stock") return "stock"
  if (value === "preorder") return "preorder"
  if (value === "company" || value === "wholebusiness") return ""
  throw new Error(`Belongs to "${raw.trim()}" must be stock, pre-order, or left blank for the whole business`)
}

/**
 * What deleting an expense does (services/expenses.py delete_expense): its journal entry is
 * reversed, so the books net to zero, and restoring it posts it again.
 */
export const EXPENSE_DELETE_DESCRIPTION =
  "A reversing journal entry is posted so the expense no longer counts in the books. You can restore it later, which posts it again."
