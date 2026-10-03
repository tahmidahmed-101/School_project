import { useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { BookOpen, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FieldError } from "@/components/ui/field"
import { FormDialog } from "@/components/common/FormDialog"
import { DateField, TextField } from "@/components/common/form-fields"
import { useAppDispatch } from "@/app/hooks"
import { moneySchema, reportFormError } from "@/lib/forms"
import { formatCurrency, todayLocalISODate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { createJournalEntry } from "../slices/journalEntrySlice"
import type { Account } from "../types"
import { accountLabel } from "../hooks/useFinanceHelpers"

const schema = z
  .object({
    entry_date: z.string().min(1, "Pick a date"),
    description: z.string(),
    lines: z
      .array(
        z.object({
          account_id: z.string().min(1, "Pick an account"),
          debit: moneySchema,
          credit: moneySchema,
        })
      )
      .min(2, "A journal entry needs at least two lines"),
  })
  .superRefine((values, ctx) => {
    values.lines.forEach((line, i) => {
      const d = Number(line.debit || 0)
      const c = Number(line.credit || 0)
      if ((d > 0 && c > 0) || (d === 0 && c === 0)) {
        ctx.addIssue({ code: "custom", path: ["lines", i, "debit"], message: "Enter a debit or a credit" })
      }
    })
    const totalDebit = values.lines.reduce((s, l) => s + Math.round(Number(l.debit || 0) * 100), 0)
    const totalCredit = values.lines.reduce((s, l) => s + Math.round(Number(l.credit || 0) * 100), 0)
    if (totalDebit !== totalCredit) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "Debits must equal credits" })
    }
  })

type FormValues = z.infer<typeof schema>

const emptyLine = { account_id: "", debit: "", credit: "" }

export function JournalEntryFormDialog({
  open,
  onOpenChange,
  accounts,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: Account[]
}) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const {
    control,
    register,
    reset,
    setError,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { entry_date: todayLocalISODate(), description: "", lines: [emptyLine, emptyLine] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: "lines" })
  const lines = useWatch({ control, name: "lines" })

  useEffect(() => {
    if (open) reset({ entry_date: todayLocalISODate(), description: "", lines: [emptyLine, emptyLine] })
  }, [open, reset])

  const activeAccounts = useMemo(() => accounts.filter((a) => a.is_active), [accounts])
  const totalDebit = (lines ?? []).reduce((s, l) => s + Number(l.debit || 0), 0)
  const totalCredit = (lines ?? []).reduce((s, l) => s + Number(l.credit || 0), 0)
  const balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100) && totalDebit > 0

  const onSubmit = async (values: FormValues) => {
    try {
      const entry = await dispatch(
        createJournalEntry({
          entry_date: values.entry_date,
          description: values.description.trim(),
          lines: values.lines.map((l) => ({
            account_id: l.account_id,
            debit: l.debit || "0",
            credit: l.credit || "0",
          })),
        })
      ).unwrap()
      toast.success("Journal entry posted")
      onOpenChange(false)
      navigate(`/accounting/journal-entries/${entry.id}`)
    } catch (err) {
      reportFormError(err, {
        setError,
        fields: ["entry_date", "description", "lines"],
        fallback: "Failed to post journal entry",
      })
    }
  }

  const linesError = (errors.lines as { message?: string; root?: { message?: string } } | undefined)
  const linesMessage = linesError?.root?.message ?? linesError?.message

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      className="sm:max-w-3xl"
      title={
        <span className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" /> New Journal Entry
        </span>
      }
      description="Manual entries post immediately and can't be edited afterwards — only reversed."
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel="Post Entry"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <DateField label="Entry date *" id="je-date" error={errors.entry_date} {...register("entry_date")} />
        <TextField
          className="sm:col-span-2"
          label="Description"
          id="je-desc"
          placeholder="e.g. Owner capital injection"
          {...register("description")}
        />
      </div>

      <div className="rounded-lg border border-border">
        <div className="grid grid-cols-[1fr_130px_130px_40px] gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border bg-muted/40">
          <span>ACCOUNT</span>
          <span className="text-right">DEBIT</span>
          <span className="text-right">CREDIT</span>
          <span />
        </div>
        <div className="divide-y divide-border">
          {fields.map((f, index) => {
            const lineErrors = errors.lines?.[index]
            return (
              <div key={f.id} className="grid grid-cols-[1fr_130px_130px_40px] gap-2 px-3 py-2 items-start">
                <div>
                  <Controller
                    control={control}
                    name={`lines.${index}.account_id`}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger aria-label={`Line ${index + 1} account`} aria-invalid={!!lineErrors?.account_id}>
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeAccounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {accountLabel(a)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[lineErrors?.account_id, lineErrors?.debit]} />
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  aria-label={`Line ${index + 1} debit`}
                  className="text-right"
                  {...register(`lines.${index}.debit`)}
                />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  aria-label={`Line ${index + 1} credit`}
                  className="text-right"
                  {...register(`lines.${index}.credit`)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={fields.length <= 2}
                  onClick={() => remove(index)}
                  aria-label={`Remove line ${index + 1}`}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            )
          })}
        </div>
        <div className="grid grid-cols-[1fr_130px_130px_40px] gap-2 px-3 py-2 border-t border-border bg-muted/40 text-sm font-semibold">
          <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => append(emptyLine)}>
            <Plus className="size-4" /> Add line
          </Button>
          <span className="text-right">{formatCurrency(totalDebit)}</span>
          <span className="text-right">{formatCurrency(totalCredit)}</span>
          <span />
        </div>
      </div>
      <p className={cn("text-sm", balanced ? "text-green-600 dark:text-green-500" : "text-muted-foreground")}>
        {balanced
          ? "Balanced — debits equal credits."
          : `Out of balance by ${formatCurrency(Math.abs(totalDebit - totalCredit))}.`}
      </p>
      {linesMessage && <p className="text-sm text-destructive">{linesMessage}</p>}
    </FormDialog>
  )
}
