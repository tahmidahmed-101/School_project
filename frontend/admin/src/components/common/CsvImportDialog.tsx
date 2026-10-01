import { useMemo, useRef, useState } from "react"
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { getApiErrorMessage } from "@/lib/api/client"
import { downloadCsv, parseCsv } from "@/lib/csv"
import { cn } from "@/lib/utils"

export type ImportFieldType = "string" | "number" | "integer" | "boolean" | "date" | "enum"

export interface ImportField {
  /** Key in the create payload. */
  key: string
  label: string
  required?: boolean
  type?: ImportFieldType
  /** Allowed values for `type: "enum"` (matched case-insensitively, spaces → underscores). */
  options?: readonly string[]
  /** Extra header names that auto-map to this field (case/spacing insensitive). */
  aliases?: string[]
  /** Shown in the template's example row. */
  example?: string
  /**
   * Converts the cell text to the payload value, e.g. a category name → its id. Throw an
   * Error (or return undefined for a non-empty cell) to reject the row with that message.
   */
  resolve?: (raw: string) => unknown | Promise<unknown>
}

interface CsvImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** e.g. "products" — used in titles and file names. */
  entityName: string
  fields: ImportField[]
  /** Creates one record; reject (e.g. `dispatch(postData(...)).unwrap()`) to mark the row failed. */
  createRow: (payload: Record<string, unknown>) => Promise<unknown>
  /** Called once after an import run that created at least one record (refresh the list here). */
  onComplete?: () => void
}

const MAX_ROWS = 1000
const IGNORE = "__ignore__"

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

type Step = "upload" | "map" | "importing" | "done"

interface RowResult {
  rowNumber: number
  cells: string[]
  error?: string
}

function coerce(field: ImportField, raw: string): unknown {
  const value = raw.trim()
  switch (field.type) {
    case "number": {
      const n = Number(value.replace(/,/g, ""))
      if (!Number.isFinite(n)) throw new Error(`${field.label} must be a number`)
      return String(n) // DRF decimals accept strings and keep precision
    }
    case "integer": {
      const n = Number(value)
      if (!Number.isInteger(n)) throw new Error(`${field.label} must be a whole number`)
      return n
    }
    case "boolean": {
      const v = value.toLowerCase()
      if (["true", "yes", "y", "1", "active"].includes(v)) return true
      if (["false", "no", "n", "0", "inactive"].includes(v)) return false
      throw new Error(`${field.label} must be yes/no or true/false`)
    }
    case "date": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field.label} must be a date like 2026-01-31`)
      return value
    }
    case "enum": {
      const v = value.toLowerCase().replace(/\s+/g, "_")
      const match = field.options?.find((o) => o.toLowerCase() === v)
      if (!match) throw new Error(`${field.label} must be one of: ${field.options?.join(", ")}`)
      return match
    }
    default:
      return value
  }
}

export function CsvImportDialog({
  open,
  onOpenChange,
  entityName,
  fields,
  createRow,
  onComplete,
}: CsvImportDialogProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const cancelRef = useRef(false)
  const [step, setStep] = useState<Step>("upload")
  const [fileName, setFileName] = useState("")
  const [parseError, setParseError] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  // field key -> CSV column index (or IGNORE)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [results, setResults] = useState<RowResult[]>([])
  const [progress, setProgress] = useState(0)
  const [cancelled, setCancelled] = useState(false)

  const reset = () => {
    setStep("upload")
    setFileName("")
    setParseError(null)
    setHeaders([])
    setRows([])
    setMapping({})
    setResults([])
    setProgress(0)
    setCancelled(false)
    cancelRef.current = false
    if (fileInput.current) fileInput.current.value = ""
  }

  const close = (next: boolean) => {
    if (!next && step === "importing") return // finish or cancel first
    if (!next) reset()
    onOpenChange(next)
  }

  const downloadTemplate = () => {
    downloadCsv(
      [fields.map((f) => f.label), fields.map((f) => f.example ?? "")],
      `${entityName.replace(/\s+/g, "-")}-import-template`
    )
  }

  const handleFile = async (file: File) => {
    setParseError(null)
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setParseError("Please choose a .csv file. In Excel, use File → Save As → CSV UTF-8.")
      return
    }
    const parsed = parseCsv(await file.text())
    if (parsed.length < 2) {
      setParseError("The file needs a header row and at least one data row.")
      return
    }
    const [head, ...data] = parsed
    if (data.length > MAX_ROWS) {
      setParseError(`This file has ${data.length} rows; the limit is ${MAX_ROWS} per import. Split it and import in parts.`)
      return
    }

    // Auto-map each field to a header: exact matches on label/key/alias first, then a
    // header that contains the field's name (e.g. "Email Address" → Email). A column is
    // used for at most one field.
    const auto: Record<string, string> = {}
    const normHeaders = head.map(normalize)
    const used = new Set<number>()
    const namesFor = (f: ImportField) => [f.label, f.key, ...(f.aliases ?? [])].map(normalize).filter(Boolean)
    for (const f of fields) {
      const names = namesFor(f)
      const idx = normHeaders.findIndex((h, i) => !used.has(i) && names.includes(h))
      if (idx >= 0) {
        auto[f.key] = String(idx)
        used.add(idx)
      }
    }
    for (const f of fields) {
      if (auto[f.key]) continue
      const names = namesFor(f)
      const idx = normHeaders.findIndex((h, i) => !used.has(i) && h && names.some((n) => h.includes(n)))
      auto[f.key] = idx >= 0 ? String(idx) : IGNORE
      if (idx >= 0) used.add(idx)
    }

    setFileName(file.name)
    setHeaders(head.map((h, i) => h.trim() || `Column ${i + 1}`))
    setRows(data)
    setMapping(auto)
    setStep("map")
  }

  const missingRequired = fields.filter((f) => f.required && (mapping[f.key] ?? IGNORE) === IGNORE)

  // Synchronous checks (required + type) for the preview; resolvers run during import.
  const validateSync = (cells: string[]): string | undefined => {
    for (const f of fields) {
      const col = mapping[f.key]
      const raw = col && col !== IGNORE ? (cells[Number(col)] ?? "").trim() : ""
      if (!raw) {
        if (f.required) return `${f.label} is required`
        continue
      }
      if (f.resolve) continue
      try {
        coerce(f, raw)
      } catch (e) {
        return (e as Error).message
      }
    }
    return undefined
  }

  const previewRows = useMemo(() => rows.slice(0, 5), [rows])
  const invalidCount = useMemo(
    () => (step === "map" ? rows.filter((r) => validateSync(r)).length : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, mapping, step]
  )

  const buildPayload = async (cells: string[]): Promise<Record<string, unknown>> => {
    const payload: Record<string, unknown> = {}
    for (const f of fields) {
      const col = mapping[f.key]
      const raw = col && col !== IGNORE ? (cells[Number(col)] ?? "").trim() : ""
      if (!raw) {
        if (f.required) throw new Error(`${f.label} is required`)
        continue
      }
      const value = f.resolve ? await f.resolve(raw) : coerce(f, raw)
      if (value === undefined) throw new Error(`${f.label}: "${raw}" was not found`)
      payload[f.key] = value
    }
    return payload
  }

  const runImport = async () => {
    setStep("importing")
    cancelRef.current = false
    const out: RowResult[] = []
    let created = 0

    for (let i = 0; i < rows.length; i++) {
      if (cancelRef.current) {
        setCancelled(true)
        break
      }
      const cells = rows[i]
      const rowNumber = i + 2 // +1 for the header, +1 for 1-based spreadsheet rows
      try {
        const payload = await buildPayload(cells)
        await createRow(payload)
        created++
        out.push({ rowNumber, cells })
      } catch (err) {
        const message = err instanceof Error ? err.message : getApiErrorMessage(err, "Could not create this row")
        out.push({ rowNumber, cells, error: message })
      }
      setProgress(Math.round(((i + 1) / rows.length) * 100))
      setResults([...out])
    }

    setStep("done")
    if (created > 0) onComplete?.()
  }

  const failed = results.filter((r) => r.error)
  const createdCount = results.length - failed.length

  const downloadFailed = () => {
    downloadCsv(
      [[...headers, "Import error"], ...failed.map((r) => [...r.cells, r.error ?? ""])],
      `${entityName.replace(/\s+/g, "-")}-failed-rows`
    )
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="capitalize">Import {entityName}</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload a CSV file. Each row creates one record."}
            {step === "map" && `${fileName}: ${rows.length} row${rows.length === 1 ? "" : "s"}. Check how columns map to fields.`}
            {step === "importing" && `Importing ${rows.length} rows…`}
            {step === "done" && (cancelled ? "Import stopped." : "Import finished.")}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (file) void handleFile(file)
              }}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-10 text-center transition-colors hover:border-primary-500/60 hover:bg-muted/40"
            >
              <FileSpreadsheet className="size-8 text-muted-foreground" />
              <span className="text-sm font-medium">Click to choose a CSV file, or drop it here</span>
              <span className="text-xs text-muted-foreground">Up to {MAX_ROWS} rows, first row must be column headers</span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
              }}
            />
            {parseError && (
              <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                {parseError}
              </p>
            )}
            <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">Columns</p>
              <p>
                {fields.map((f, i) => (
                  <span key={f.key}>
                    {i > 0 && ", "}
                    {f.label}
                    {f.required && <span className="text-destructive">*</span>}
                  </span>
                ))}
              </p>
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-2 sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                  <span className="text-sm">
                    {f.label}
                    {f.required && <span className="text-destructive">*</span>}
                  </span>
                  <Select
                    value={mapping[f.key] ?? IGNORE}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}
                  >
                    <SelectTrigger className="h-8 w-44" aria-label={`CSV column for ${f.label}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={IGNORE}>— Don't import —</SelectItem>
                      {headers.map((h, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Row</th>
                      {fields.map((f) => (
                        <th key={f.key} className="whitespace-nowrap px-2 py-1.5 text-left font-medium">
                          {f.label}
                        </th>
                      ))}
                      <th className="px-2 py-1.5 text-left font-medium">Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => {
                      const error = validateSync(r)
                      return (
                        <tr key={i} className="border-t border-border">
                          <td className="px-2 py-1.5 text-muted-foreground">{i + 2}</td>
                          {fields.map((f) => {
                            const col = mapping[f.key]
                            return (
                              <td key={f.key} className="max-w-40 truncate px-2 py-1.5">
                                {col && col !== IGNORE ? r[Number(col)] : <span className="text-muted-foreground">—</span>}
                              </td>
                            )
                          })}
                          <td className="px-2 py-1.5">
                            {error ? (
                              <span className="text-destructive" title={error}>
                                {error}
                              </span>
                            ) : (
                              <CheckCircle2 className="size-4 text-emerald-500" aria-label="OK" />
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {invalidCount > 0 && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  {invalidCount} of {rows.length} rows have problems and will be skipped. You can download them after the import.
                </p>
              )}
            </div>

            {missingRequired.length > 0 && (
              <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                Choose a column for: {missingRequired.map((f) => f.label).join(", ")}
              </p>
            )}
          </div>
        )}

        {step === "importing" && (
          <div className="space-y-3 py-4">
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground">
              {results.length} of {rows.length} processed · {createdCount} created
              {failed.length > 0 && ` · ${failed.length} failed`}
            </p>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" /> {createdCount} created
              </div>
              {failed.length > 0 && (
                <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="size-4" /> {failed.length} failed
                </div>
              )}
              {cancelled && (
                <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <X className="size-4" /> {rows.length - results.length} not processed
                </div>
              )}
            </div>
            {failed.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Row</th>
                      <th className="px-2 py-1.5 text-left font-medium">Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failed.map((r) => (
                      <tr key={r.rowNumber} className="border-t border-border">
                        <td className="px-2 py-1.5 text-muted-foreground">{r.rowNumber}</td>
                        <td className="px-2 py-1.5 text-destructive">{r.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <DialogFooter className={cn("gap-2", step === "upload" && "sm:justify-between")}>
          {step === "upload" && (
            <>
              <Button type="button" variant="outline" onClick={downloadTemplate}>
                <Download className="size-4" /> Download template
              </Button>
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
            </>
          )}
          {step === "map" && (
            <>
              <Button type="button" variant="ghost" onClick={reset}>
                Choose another file
              </Button>
              <Button type="button" onClick={runImport} disabled={missingRequired.length > 0}>
                <Upload className="size-4" /> Import {rows.length} row{rows.length === 1 ? "" : "s"}
              </Button>
            </>
          )}
          {step === "importing" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                cancelRef.current = true
              }}
            >
              <Loader2 className="size-4 animate-spin" /> Stop after current row
            </Button>
          )}
          {step === "done" && (
            <>
              {failed.length > 0 && (
                <Button type="button" variant="outline" onClick={downloadFailed}>
                  <Download className="size-4" /> Download failed rows
                </Button>
              )}
              <Button type="button" onClick={() => close(false)}>
                Done
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Standard "Import" button + dialog, for a page header's actions. */
export function CsvImportButton(props: Omit<CsvImportDialogProps, "open" | "onOpenChange">) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" variant="outline" size="action" onClick={() => setOpen(true)}>
        <Upload className="size-4" /> Import
      </Button>
      <CsvImportDialog {...props} open={open} onOpenChange={setOpen} />
    </>
  )
}
