import { toast } from "sonner"
import { saveBlob } from "./download"

/**
 * RFC 4180 CSV parsing: quoted fields, escaped quotes (""), commas and newlines inside
 * quotes, CRLF/LF line endings and a UTF-8 BOM (as written by Excel).
 */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else {
      field += ch
    }
  }

  // Last line without a trailing newline.
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // Drop fully blank lines (e.g. trailing empty rows from spreadsheets).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""))
}

// Cells starting with these are evaluated as formulas by Excel/Sheets (CSV injection).
const FORMULA_PREFIX = /^[=+\-@\t\r]/

function toText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function escapeCell(value: unknown): string {
  let text = toText(value)
  // Neutralise formulas, but leave plain negative numbers (e.g. "-12.50") readable.
  if (FORMULA_PREFIX.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Serialises rows to CSV (with a BOM so Excel reads UTF-8 — names with accents, ৳ — correctly). */
export function toCsv(rows: unknown[][]): string {
  return "﻿" + rows.map((r) => r.map(escapeCell).join(",")).join("\r\n")
}

/** Triggers a browser download of a CSV built from `rows`. */
export function downloadCsv(rows: unknown[][], filename: string): void {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" })
  saveBlob(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`)
}

/**
 * Downloads objects as CSV, one column per key (the union of keys, so rows with optional
 * fields don't drop columns). Returns false — and tells the user — when there is nothing to export.
 */
export function exportToCSV(data: Record<string, unknown>[], filename: string): boolean {
  if (!data.length) {
    toast.info("Nothing to export")
    return false
  }
  const headers = Array.from(new Set(data.flatMap((row) => Object.keys(row))))
  downloadCsv([headers, ...data.map((row) => headers.map((h) => row[h]))], filename)
  return true
}
