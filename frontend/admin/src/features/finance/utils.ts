import { sumMoney } from "@/lib/money"
import type { JournalEntry } from "./types"

/** Entry size = sum of its debits (always equal to its credits). */
export const entryTotal = (entry: JournalEntry) => sumMoney(entry.lines.map((line) => line.debit))

/**
 * What deleting an expense does (services/expenses.py delete_expense): its journal entry is
 * reversed, so the books net to zero, and restoring it posts it again.
 */
export const EXPENSE_DELETE_DESCRIPTION =
  "A reversing journal entry is posted so the expense no longer counts in the books. You can restore it later, which posts it again."
