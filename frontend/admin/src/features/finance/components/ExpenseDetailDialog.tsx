import { Link } from "react-router-dom"
import { BookOpen, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DeleteModal } from "@/components/common/DeleteModal"
import { formatCurrency, formatDate } from "@/lib/format"
import type { Account, Expense, ExpenseCategory } from "../types"
import { accountLabel } from "../hooks/useFinanceHelpers"
import { DetailRow } from "./shared"

interface Props {
  expense: Expense | null
  accountsById: Map<string, Account>
  categoriesById: Map<string, ExpenseCategory>
  canPost: boolean
  onClose: () => void
  onEdit: (expense: Expense) => void
  onDelete: (expense: Expense) => void
}

export function ExpenseDetailDialog({
  expense,
  accountsById,
  categoriesById,
  canPost,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  return (
    <Dialog open={!!expense} onOpenChange={(open) => !open && onClose()}>
      {expense && (
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{expense.payee}</DialogTitle>
            <DialogDescription>
              {expense.reference_number ? (
                <>
                  Reference: <span className="font-mono">{expense.reference_number}</span>
                </>
              ) : (
                "No reference number"
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg bg-muted/40 p-4 grid grid-cols-2 gap-4">
            <div>
              <span className="text-muted-foreground text-xs block">Amount</span>
              <span className="text-2xl font-bold text-primary">{formatCurrency(expense.amount)}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-xs block">Expense date</span>
              <span className="font-semibold text-foreground">{formatDate(expense.expense_date)}</span>
            </div>
          </div>

          <div>
            <DetailRow label="Category">
              {expense.category_id ? categoriesById.get(expense.category_id)?.name ?? "—" : "Uncategorised"}
            </DetailRow>
            <DetailRow label="Expense account">{accountLabel(accountsById.get(expense.expense_account_id))}</DetailRow>
            <DetailRow label="Paid from">{accountLabel(accountsById.get(expense.payment_account_id))}</DetailRow>
            <DetailRow label="Journal entry">
              {expense.journal_entry_id ? (
                <Link
                  to={`/accounting/journal-entries/${expense.journal_entry_id}`}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <BookOpen className="size-3.5" /> View posting
                </Link>
              ) : (
                "Not posted"
              )}
            </DetailRow>
            {expense.description && <DetailRow label="Description">{expense.description}</DetailRow>}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 sm:justify-between">
            {canPost ? (
              <DeleteModal
                title="Delete this expense?"
                description="Posted expenses can't be deleted — the backend will ask you to reverse the journal entry instead."
                onConfirm={() => onDelete(expense)}
                trigger={
                  <Button variant="outline" className="text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Delete
                  </Button>
                }
              />
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              {canPost && (
                <Button variant="outline" onClick={() => onEdit(expense)}>
                  Edit
                </Button>
              )}
              <Button onClick={onClose}>Close</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
