import { sumMoney } from "@/lib/money"
import type { JournalEntry } from "./types"

/** Entry size = sum of its debits (always equal to its credits). */
export const entryTotal = (entry: JournalEntry) => sumMoney(entry.lines.map((line) => line.debit))
