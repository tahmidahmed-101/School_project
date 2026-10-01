import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeading } from "@/components/common/PageHeading"
import { DetailPageState } from "@/components/common/DetailPageState"
import { resolveDetailState } from "@/lib/detailState"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency, formatDate, humanize } from "@/lib/format"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"

import { fetchSingle, reverseJournalEntry } from "../slices/journalEntrySlice"
import type { JournalEntry } from "../types"
import { accountLabel, useAccounts, useCan } from "../hooks/useFinanceHelpers"
import { entryTotal } from "../utils"
import { DetailRow } from "./shared"

const JournalEntryDetail = () => {
  const { id = "" } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { singleData, singleStatus, singleError } = useAppSelector((state) => state.journalEntries)
  const loaded = singleData as JournalEntry | null
  const entry = loaded && loaded.id === id ? loaded : null
  const canPost = useCan("accounting.post")
  const { accountsById } = useAccounts()

  const [reverseOpen, setReverseOpen] = useState(false)
  const [reverseDate, setReverseDate] = useState("")
  const [reason, setReason] = useState("")
  const [reversing, setReversing] = useState(false)

  useDocumentTitle(entry ? `Journal Entry ${formatDate(entry.entry_date)}` : "Journal Entry")

  const load = useCallback(() => dispatch(fetchSingle(id)), [dispatch, id])
  useEffect(() => {
    load()
  }, [load])

  const state = resolveDetailState(singleStatus, singleError, !!entry)
  if (state || !entry) {
    return (
      <DetailPageState
        state={state ?? "loading"}
        entity="Journal entry"
        backTo="/accounting/journal-entries"
        backLabel="Back to journal"
        error={singleError}
        onRetry={load}
      />
    )
  }

  const totalDebit = entry.lines.reduce((s, l) => s + Number(l.debit), 0)
  const totalCredit = entry.lines.reduce((s, l) => s + Number(l.credit), 0)
  const canReverse = canPost && entry.status === "posted" && !entry.reversed_by_id

  const handleReverse = async () => {
    setReversing(true)
    try {
      const reversal = await dispatch(
        reverseJournalEntry({
          id: entry.id,
          payload: { ...(reverseDate ? { entry_date: reverseDate } : {}), reason: reason.trim() },
        })
      ).unwrap()
      toast.success("Reversing entry posted")
      setReverseOpen(false)
      navigate(`/accounting/journal-entries/${reversal.id}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to reverse entry"))
    } finally {
      setReversing(false)
    }
  }

  return (
    <div className="section-container space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Button variant="back" size="sm" asChild>
            <Link to="/accounting/journal-entries">
              <ArrowLeft className="size-4" /> Journal
            </Link>
          </Button>
          <PageHeading
            title={entry.description || "Journal entry"}
            description={`Posted ${formatDate(entry.entry_date)} · ${formatCurrency(entryTotal(entry))}`}
          />
        </div>
        {canReverse && (
          <Button size="action" variant="outline" onClick={() => setReverseOpen(true)}>
            <Undo2 className="size-5" /> Reverse Entry
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Lines</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ACCOUNT</TableHead>
                  <TableHead className="text-right">DEBIT</TableHead>
                  <TableHead className="text-right">CREDIT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entry.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className={Number(line.credit) > 0 ? "pl-8" : undefined}>
                      {accountLabel(accountsById.get(line.account_id), line.account_id)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(line.debit) > 0 ? formatCurrency(line.debit) : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(line.credit) > 0 ? formatCurrency(line.credit) : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(totalDebit)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(totalCredit)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow label="Status">
              <StatusBadge status={entry.status} tone={entry.status === "posted" ? "success" : "secondary"} />
            </DetailRow>
            <DetailRow label="Entry date">{formatDate(entry.entry_date)}</DetailRow>
            <DetailRow label="Source">{entry.reference_type ? humanize(entry.reference_type) : "Manual entry"}</DetailRow>
            {entry.reference_id && (
              <DetailRow label="Reference id">
                <span className="font-mono text-xs">{entry.reference_id}</span>
              </DetailRow>
            )}
            {entry.reverses_id && (
              <DetailRow label="Reverses">
                <Link className="text-primary hover:underline" to={`/accounting/journal-entries/${entry.reverses_id}`}>
                  Original entry
                </Link>
              </DetailRow>
            )}
            {entry.reversed_by_id && (
              <DetailRow label="Reversed by">
                <Link className="text-primary hover:underline" to={`/accounting/journal-entries/${entry.reversed_by_id}`}>
                  Reversing entry
                </Link>
              </DetailRow>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={reverseOpen} onOpenChange={setReverseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reverse this entry?</DialogTitle>
            <DialogDescription>
              Posts a new entry with debits and credits swapped. The original stays in the ledger for the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field>
              <FieldLabel htmlFor="rev-date">Reversal date</FieldLabel>
              <FieldContent>
                <Input
                  id="rev-date"
                  type="date"
                  min={entry.entry_date}
                  value={reverseDate}
                  onChange={(e) => setReverseDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Leave blank for today.</p>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="rev-reason">Reason</FieldLabel>
              <FieldContent>
                <Input id="rev-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              </FieldContent>
            </Field>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setReverseOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleReverse} disabled={reversing}>
              {reversing ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />} Post Reversal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default JournalEntryDetail
