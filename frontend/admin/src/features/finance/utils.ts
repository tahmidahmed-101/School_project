import type { JournalEntry } from "./types"

/** Entry size = sum of its debits (always equal to its credits). */
export const entryTotal = (entry: JournalEntry) =>
  entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0)
