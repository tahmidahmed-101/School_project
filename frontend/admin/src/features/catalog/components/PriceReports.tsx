import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { CheckCircle2, RotateCcw, Tag, XCircle } from "lucide-react"

import { DataTable } from "@/components/common/data-table"
import { DetailRow } from "@/components/common/DetailRow"
import FilterToolbar from "@/components/common/FilterToolBar"
import { FormDialog } from "@/components/common/FormDialog"
import { SelectField, TextareaField } from "@/components/common/form-fields"
import { PageHeader } from "@/components/common/PageHeader"
import { StatusBadge } from "@/components/common/StatusBadge"
import { TableActions } from "@/components/common/TableActions"
import { DateCell, LinkCell, MoneyCell } from "@/components/common/cells"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useCan } from "@/hooks/use-can"
import { useLastValue } from "@/hooks/use-dialog-presence"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useKind, type Kind, withKind } from "@/hooks/use-kind"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { reportFormError } from "@/lib/forms"
import type { Option } from "@/lib/types"

import { fetchAll, patchData } from "../slices/priceReportSlice"
import { useModerationList } from "../lib/useModerationList"
import type { PriceReport, PriceReportStatus } from "../types"

// PriceIssueReport.Status on the backend.
const STATUS_OPTIONS: Option[] = [
  { label: "Open", value: "open" },
  { label: "Resolved", value: "resolved" },
  { label: "Dismissed", value: "dismissed" },
]

// AdminPriceReportListView ordering_fields: created_at, status.
const ORDERING_OPTIONS: Option[] = [
  { label: "Newest first", value: "-created_at" },
  { label: "Oldest first", value: "created_at" },
  { label: "By status", value: "status" },
]

/**
 * Reports customers send from a product page when a price looks wrong. They are never shown
 * on the storefront; staff check the price, then mark each report resolved or dismissed.
 */
const PriceReports = ({ kind }: { kind: Kind }) => {
  const title = kind === "preorder" ? "Pre-order price reports" : "Price reports"
  useDocumentTitle(title)
  const dispatch = useAppDispatch()
  const canManage = useCan("catalog.manage")
  const reportState = useAppSelector((s) => s.catalogPriceReports)

  const [reviewing, setReviewing] = useState<PriceReport | null>(null)

  const { list, filters, isFiltered, reloadIfFiltered } = useModerationList({
    kind,
    fetch: (p) => dispatch(fetchAll(p)),
    state: reportState,
    filter: { param: "status", placeholder: "Status", options: STATUS_OPTIONS },
    orderingOptions: ORDERING_OPTIONS,
  })

  const handleStatus = async (report: PriceReport, next: PriceReportStatus) => {
    try {
      await dispatch(patchData({ id: report.id, payload: { status: next } })).unwrap()
      toast.success(next === "open" ? "Report reopened" : `Report ${next}`)
      reloadIfFiltered()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to update report"))
    }
  }

  const columns: ColumnDef<PriceReport>[] = [
    {
      id: "product",
      header: "PRODUCT",
      cell: ({ row }) => (
        <div className="min-w-0" data-no-row-click="true">
          <LinkCell to={withKind(`/product_detail/${row.original.product_id}`, kind)} className="block truncate font-medium">
            {row.original.product_name}
          </LinkCell>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {row.original.variant_sku ?? "Whole product"}
          </p>
        </div>
      ),
    },
    {
      id: "current_price",
      header: "CURRENT PRICE",
      // The variant's price now, not when it was reported; blank for whole-product reports.
      cell: ({ row }) => <MoneyCell value={row.original.current_price} />,
    },
    {
      id: "expected_price",
      header: "EXPECTED",
      cell: ({ row }) => <MoneyCell value={row.original.expected_price} emphasis />,
    },
    {
      id: "comment",
      header: "COMMENT",
      cell: ({ row }) =>
        row.original.comment ? (
          <p className="whitespace-normal break-words text-sm">{row.original.comment}</p>
        ) : (
          <span className="text-sm text-muted-foreground">No comment</span>
        ),
    },
    {
      id: "reporter",
      header: "REPORTED BY",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.original.reporter_name}</p>
          <DateCell value={row.original.created_at} className="text-xs text-muted-foreground" />
        </div>
      ),
    },
    {
      id: "status",
      header: "STATUS",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => {
        const report = row.original
        return (
          <TableActions
            itemName={`the report on ${report.product_name}`}
            onView={() => setReviewing(report)}
            actions={
              !canManage
                ? []
                : report.status === "open"
                  ? [
                      { label: "Mark resolved", icon: CheckCircle2, onSelect: () => handleStatus(report, "resolved") },
                      { label: "Dismiss", icon: XCircle, onSelect: () => handleStatus(report, "dismissed") },
                    ]
                  : [{ label: "Reopen", icon: RotateCcw, onSelect: () => handleStatus(report, "open") }]
            }
          />
        )
      },
    },
  ]

  return (
    <div className="section-container">
      <PageHeader title={title} />

      {/* ?search= matches the comment, the product name and the variant SKU. */}
      <FilterToolbar
        searchPlaceholder="Search code, comment, product or SKU…"
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={filters}
      />

      <DataTable
        columns={columns}
        data={reportState.data}
        {...list.tableProps}
        onRowClick={setReviewing}
        emptyIcon={Tag}
        emptyTitle="No price reports"
        emptyDescription={
          isFiltered
            ? "Try adjusting the search or filters."
            : "Reports customers send about a wrong price appear here."
        }
        minWidth="1080px"
        columnWidths={["210px", "130px", "120px", "auto", "160px", "120px", "80px"]}
        unlabelledColumns={["actions"]}
      />

      <ReviewDialog
        report={reviewing}
        canManage={canManage}
        onClose={() => setReviewing(null)}
        onSaved={reloadIfFiltered}
      />
    </div>
  )
}

// Mirrors AdminPriceReportUpdateSerializer (staff_note max_length 2000).
const reviewSchema = z.object({
  status: z.enum(["open", "resolved", "dismissed"]),
  staff_note: z.string().trim().max(2000, "At most 2000 characters"),
})
type ReviewValues = z.infer<typeof reviewSchema>

function ReviewDialog({
  report: selected,
  canManage,
  onClose,
  onSaved,
}: {
  report: PriceReport | null
  canManage: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const dispatch = useAppDispatch()
  const report = useLastValue(selected)
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ReviewValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { status: "open", staff_note: "" },
  })

  useEffect(() => {
    if (selected) reset({ status: selected.status, staff_note: selected.staff_note })
  }, [selected, reset])

  const onSubmit = async (values: ReviewValues) => {
    if (!report) return
    try {
      await dispatch(patchData({ id: report.id, payload: values })).unwrap()
      toast.success("Report updated")
      onSaved()
      onClose()
    } catch (err) {
      reportFormError(err, { setError, fields: ["status", "staff_note"], fallback: "Failed to update report" })
    }
  }

  return (
    <FormDialog
      open={!!selected}
      onOpenChange={(open) => !open && onClose()}
      title="Price report"
      description={report ? `Reported by ${report.reporter_name} on ${formatDateTime(report.created_at)}` : undefined}
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel="Save"
      submitDisabled={!canManage || !isDirty}
      size="lg"
    >
      {report && (
        <div>
          <DetailRow label="Product">
            <Link to={`/product_detail/${report.product_id}`} className="text-primary hover:underline">
              {report.product_name}
            </Link>
          </DetailRow>
          <DetailRow label="Variant SKU">
            {report.variant_sku ? <span className="font-mono">{report.variant_sku}</span> : "Whole product"}
          </DetailRow>
          <DetailRow label="Current price">
            {report.current_price === null ? "—" : formatCurrency(report.current_price)}
          </DetailRow>
          <DetailRow label="Expected price">
            {report.expected_price === null ? "Not given" : formatCurrency(report.expected_price)}
          </DetailRow>
          <DetailRow label="Comment">
            <span className="whitespace-pre-wrap font-normal">{report.comment || "No comment"}</span>
          </DetailRow>
          {report.resolved_at && (
            <DetailRow label={report.status === "dismissed" ? "Dismissed" : "Resolved"}>
              {formatDateTime(report.resolved_at)}
              {report.resolved_by_name && ` by ${report.resolved_by_name}`}
            </DetailRow>
          )}
        </div>
      )}
      <SelectField control={control} name="status" label="Status" options={STATUS_OPTIONS} disabled={!canManage} />
      <TextareaField
        label="Staff note"
        rows={3}
        placeholder="What was checked or changed. Customers never see this."
        disabled={!canManage}
        error={errors.staff_note}
        {...register("staff_note")}
      />
    </FormDialog>
  )
}

const PriceReportsPage = () => {
  const kind = useKind()
  return <PriceReports key={kind} kind={kind} />
}

export default PriceReportsPage
