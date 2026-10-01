import { useEffect, useMemo } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { CheckCircle2, Loader2, Receipt } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { useAppDispatch } from "@/app/hooks"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { todayLocalISODate } from "@/lib/format"
import { patchData, postData } from "../slices/expenseSlice"
import type { Account, Expense, ExpenseCategory, ExpenseCreatePayload, ExpenseUpdatePayload } from "../types"
import { accountLabel } from "../hooks/useFinanceHelpers"

const NONE = "none"

const schema = z.object({
  expense_date: z.string().min(1, "Pick a date"),
  payee: z.string().trim().min(1, "Payee is required"),
  description: z.string(),
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((v) => Number(v) >= 0.01, "Amount must be at least 0.01"),
  category_id: z.string(),
  expense_account_id: z.string(),
  payment_account_id: z.string().min(1, "Pick the account the money was paid from"),
  reference_number: z.string(),
})

type FormValues = z.infer<typeof schema>

function valuesFor(expense: Expense | null): FormValues {
  if (expense) {
    return {
      expense_date: expense.expense_date,
      payee: expense.payee,
      description: expense.description,
      amount: expense.amount,
      category_id: expense.category_id ?? NONE,
      expense_account_id: expense.expense_account_id,
      payment_account_id: expense.payment_account_id,
      reference_number: expense.reference_number,
    }
  }
  return {
    expense_date: todayLocalISODate(),
    payee: "",
    description: "",
    amount: "",
    category_id: NONE,
    expense_account_id: NONE,
    payment_account_id: "",
    reference_number: "",
  }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Record being edited, or null to record a new one. */
  expense: Expense | null
  accounts: Account[]
  categories: ExpenseCategory[]
}

export function ExpenseFormDialog({ open, onOpenChange, expense, accounts, categories }: Props) {
  const dispatch = useAppDispatch()
  const isEdit = !!expense

  const {
    control,
    register,
    reset,
    setError,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: valuesFor(expense) })

  useEffect(() => {
    if (open) reset(valuesFor(expense))
  }, [open, expense, reset])

  const expenseAccounts = useMemo(() => accounts.filter((a) => a.type === "expense" && a.is_active), [accounts])
  // Money leaves an asset (bank/cash) — or, for accrued spend, lands on a liability.
  const paymentAccounts = useMemo(
    () => accounts.filter((a) => (a.type === "asset" || a.type === "liability") && a.is_active),
    [accounts]
  )
  const activeCategories = useMemo(() => categories.filter((c) => c.is_active), [categories])

  const onSubmit = async (values: FormValues) => {
    try {
      if (expense) {
        // Only payee / description / reference can change once the expense is posted.
        const payload: ExpenseUpdatePayload = {
          payee: values.payee.trim(),
          description: values.description,
          reference_number: values.reference_number.trim(),
        }
        await dispatch(patchData({ id: expense.id, payload: payload as Partial<Expense> })).unwrap()
        toast.success("Expense updated")
      } else {
        const payload: ExpenseCreatePayload = {
          expense_date: values.expense_date,
          payee: values.payee.trim(),
          description: values.description,
          amount: values.amount,
          payment_account_id: values.payment_account_id,
          reference_number: values.reference_number.trim(),
          ...(values.category_id !== NONE ? { category_id: values.category_id } : {}),
          ...(values.expense_account_id !== NONE ? { expense_account_id: values.expense_account_id } : {}),
        }
        await dispatch(postData({ payload: payload as Partial<Expense> })).unwrap()
        toast.success("Expense recorded and posted to the ledger")
      }
      onOpenChange(false)
    } catch (err) {
      const fieldErrors = getApiFieldErrors(err)
      for (const [field, message] of Object.entries(fieldErrors)) {
        if (field in schema.shape) setError(field as keyof FormValues, { message })
      }
      toast.error(getApiErrorMessage(err, "Failed to save expense"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            {isEdit ? "Edit Expense" : "Record Expense"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Date, amount and accounts are locked because the expense is already posted. To change them, reverse its journal entry and record a new expense."
              : "Recording an expense posts a journal entry: debit the expense account, credit the payment account."}
          </DialogDescription>
        </DialogHeader>

        <form id="expense-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="exp-payee">Payee *</FieldLabel>
              <FieldContent>
                <Input id="exp-payee" placeholder="e.g. Khulna Stationers" aria-invalid={!!errors.payee} {...register("payee")} />
                <FieldError errors={[errors.payee]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="exp-ref">Reference #</FieldLabel>
              <FieldContent>
                <Input id="exp-ref" placeholder="Invoice or receipt number" {...register("reference_number")} />
                <FieldError errors={[errors.reference_number]} />
              </FieldContent>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="exp-date">Expense date *</FieldLabel>
              <FieldContent>
                <Input id="exp-date" type="date" disabled={isEdit} aria-invalid={!!errors.expense_date} {...register("expense_date")} />
                <FieldError errors={[errors.expense_date]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="exp-amount">Amount (BDT) *</FieldLabel>
              <FieldContent>
                <Input
                  id="exp-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  disabled={isEdit}
                  aria-invalid={!!errors.amount}
                  {...register("amount")}
                />
                <FieldError errors={[errors.amount]} />
              </FieldContent>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="exp-category">Category</FieldLabel>
              <FieldContent>
                <Controller
                  control={control}
                  name="category_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={isEdit}>
                      <SelectTrigger id="exp-category" aria-invalid={!!errors.category_id}>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No category</SelectItem>
                        {activeCategories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.category_id]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="exp-account">Expense account</FieldLabel>
              <FieldContent>
                <Controller
                  control={control}
                  name="expense_account_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={isEdit}>
                      <SelectTrigger id="exp-account" aria-invalid={!!errors.expense_account_id}>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Use the category's account</SelectItem>
                        {expenseAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {accountLabel(a)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldDescription>Pick a category, an account, or both.</FieldDescription>
                <FieldError errors={[errors.expense_account_id]} />
              </FieldContent>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="exp-payment">Paid from *</FieldLabel>
            <FieldContent>
              <Controller
                control={control}
                name="payment_account_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={isEdit}>
                    <SelectTrigger id="exp-payment" aria-invalid={!!errors.payment_account_id}>
                      <SelectValue placeholder="Select payment account" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {accountLabel(a)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.payment_account_id]} />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="exp-desc">Description</FieldLabel>
            <FieldContent>
              <Textarea id="exp-desc" rows={2} placeholder="What was this for?" {...register("description")} />
              <FieldError errors={[errors.description]} />
            </FieldContent>
          </Field>
        </form>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="expense-form" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
            {isEdit ? "Save Changes" : "Record Expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
