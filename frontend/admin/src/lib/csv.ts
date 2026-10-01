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

function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Serialises rows to CSV (with a BOM so Excel reads UTF-8 correctly). */
export function toCsv(rows: string[][]): string {
  return "﻿" + rows.map((r) => r.map(escapeCell).join(",")).join("\r\n")
}

/** Triggers a browser download of a CSV built from `rows`. */
export function downloadCsv(rows: string[][], filename: string): void {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
