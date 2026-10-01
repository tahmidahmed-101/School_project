import { toast } from "sonner"

type CsvRow = Record<string, unknown>

// Cells starting with these are evaluated as formulas by Excel/Sheets (CSV injection).
const FORMULA_PREFIX = /^[=+\-@\t\r]/

function toCell(value: unknown): string {
  let text: string
  if (value === null || value === undefined) {
    text = ""
  } else if (value instanceof Date) {
    text = value.toISOString()
  } else if (typeof value === "object") {
    text = JSON.stringify(value)
  } else {
    text = String(value)
  }

  // Neutralise formulas, but leave plain negative numbers (e.g. "-12.50") readable.
  if (FORMULA_PREFIX.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) {
    text = `'${text}`
  }

  return `"${text.replace(/"/g, '""')}"`
}

export const exportToCSV = (data: CsvRow[], filename: string): boolean => {
  if (!data.length) {
    toast.info("Nothing to export")
    return false
  }

  // Union of keys, so rows with optional fields don't drop columns.
  const headers = Array.from(new Set(data.flatMap((row) => Object.keys(row))))

  const csvRows = [
    headers.map(toCell).join(","),
    ...data.map((row) => headers.map((field) => toCell(row[field])).join(",")),
  ]

  // BOM so Excel opens UTF-8 (names with accents, ৳, etc.) correctly.
  const blob = new Blob(["﻿" + csvRows.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  })

  const url = URL.createObjectURL(blob)

  const link = document.createElement("a")
  link.href = url
  link.download = `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()

  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}
