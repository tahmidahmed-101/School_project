import type { ColumnDef } from "@tanstack/react-table"
import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DataTable } from "@/components/common/data-table"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeader } from "@/components/common/PageHeader"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { DetailRow } from "@/components/common/DetailRow"
import { DetailPageState } from "@/components/common/DetailPageState"
import { resolveDetailState } from "@/lib/detailState"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency, formatDate, humanize } from "@/lib/format"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"

import { fetchSingle, reverseJournalEntry } from "../slices/journalEntrySlice"
import type { JournalEntry } from "../types"
import { accountLabel, useAccounts } from "../hooks/useFinanceHelpers"
import { belongsToLabel, entryTotal } from "../utils"

const JournalEntryDetail = () => {
  const { id = "" } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { singleData, singleStatus, singleError } = useAppSelector((state) => state.journalEntries)
  const loaded = singleData as JournalEntry | null
  const entry = loaded && loaded.id === id ? loaded : null
  const canPost = useCan("accounting.post")
  const { accountsById } = useAccounts()

  const [reverseDate, setReverseDate] = useState("")

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

  const handleReverse = async (reason: string) => {
    try {
      const reversal = await dispatch(
        reverseJournalEntry({
          id: entry.id,
          payload: { ...(reverseDate ? { entry_date: reverseDate } : {}), reason },
        })
      ).unwrap()
      toast.success("Reversing entry posted")
      navigate(`/accounting/journal-entries/${reversal.id}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to reverse entry"))
      throw err
    }
  }

  const lineColumns: ColumnDef<JournalEntry["lines"][number]>[] = [
    {
      id: "account",
      header: "ACCOUNT",
      // Credit lines are indented, the way a journal is written by hand.
      cell: ({ row: { original: line } }) => (
        <span className={Number(line.credit) > 0 ? "block pl-5" : undefined}>
          {accountLabel(accountsById.get(line.account_id), line.account_id)}
        </span>
      ),
    },
    {
      id: "debit",
      header: "DEBIT",
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className="tabular-nums">{Number(row.original.debit) > 0 ? formatCurrency(row.original.debit) : ""}</span>
      ),
    },
    {
      id: "credit",
      header: "CREDIT",
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className="tabular-nums">
          {Number(row.original.credit) > 0 ? formatCurrency(row.original.credit) : ""}
        </span>
      ),
    },
  ]

  return (
    <div className="section-container space-y-6">
      <PageHeader
        title={entry.description || "Journal entry"}
        description={`Posted ${formatDate(entry.entry_date)} · ${formatCurrency(entryTotal(entry))}`}
        back={{ to: "/accounting/journal-entries", label: "Back to journal" }}
        actions={
          canReverse && (
            <ConfirmDialog
              trigger={
                <Button size="action" variant="outline">
                  <Undo2 className="size-5" /> Reverse Entry
                </Button>
              }
              onOpenChange={(open) => !open && setReverseDate("")}
              title="Reverse this entry?"
              confirmLabel="Post Reversal"
              reason={{ label: "Reason" }}
              onConfirm={handleReverse}
            >
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
            </ConfirmDialog>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Lines</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              embedded
              showPagination={false}
              columns={lineColumns}
              data={entry.lines}
              minWidth="420px"
              columnWidths={["auto", "140px", "140px"]}
              footer={["Total", formatCurrency(totalDebit), formatCurrency(totalCredit)]}
            />
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
            <DetailRow label="Belongs to">{belongsToLabel(entry.kind)}</DetailRow>
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
    </div>
  )
}

export default JournalEntryDetail
