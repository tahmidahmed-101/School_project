import { useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Banknote } from "lucide-react"

import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { SortSelect } from "@/components/common/SortSelect"
import { ExportButton } from "@/components/common/ExportButton"
import { DateRangeInputs } from "@/components/common/DateRangeInputs"
import { DateCell, LinkCell, MoneyCell, TextCell } from "@/components/common/cells"
import { downloadFile } from "@/lib/download"
import type { Option } from "@/lib/types"
import { useAppDispatch } from "@/app/hooks"
import { useKind } from "@/hooks/use-kind"
import { paymentsTitle, purchasingBase } from "../lib/kind"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useDebounced } from "@/hooks/use-debounced"
import { useListPage } from "@/hooks/use-list-page"

import { VENDOR_PAYMENTS_ENDPOINT, fetchAll } from "../slices/vendorPaymentSlice"
import type { VendorPayment } from "../types"
import { useProcurementSelector } from "../hooks/useProcurement"

const SORT_OPTIONS: Option[] = [
  { label: "Newest first", value: "-paid_at" },
  { label: "Oldest first", value: "paid_at" },
  { label: "Amount: high to low", value: "-amount" },
  { label: "Amount: low to high", value: "amount" },
]

const columns: ColumnDef<VendorPayment>[] = [
  {
    accessorKey: "paid_at",
    header: "PAID AT",
    cell: ({ row }) => <DateCell value={row.original.paid_at} withTime className="text-muted-foreground" />,
  },
  {
    accessorKey: "vendor_bill_number",
    header: "BILL",
    cell: ({ row }) => (
      <LinkCell to={`${purchasingBase(row.original.kind)}/bills`} className="font-mono font-semibold">
        {row.original.vendor_bill_number}
      </LinkCell>
    ),
  },
  {
    accessorKey: "amount",
    header: "AMOUNT",
    cell: ({ row }) => <MoneyCell value={row.original.amount} emphasis />,
  },
  {
    accessorKey: "method",
    header: "METHOD",
    cell: ({ row }) => <span className="text-sm">{row.original.method || "—"}</span>,
  },
  {
    accessorKey: "reference",
    header: "REFERENCE",
    cell: ({ row }) => <TextCell value={row.original.reference} muted className="text-xs font-mono" />,
  },
]

const VendorPaymentsList = () => {
  const kind = useKind()
  const title = paymentsTitle(kind)
  useDocumentTitle(title)
  const dispatch = useAppDispatch()
  const state = useProcurementSelector((state) => state.vendorPayments)

  // The text box filters by exact method (the endpoint has no free-text search).
  const [method, setMethod] = useState("")
  const debouncedMethod = useDebounced(method).trim()
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [ordering, setOrdering] = useState<Option | null>(null)

  const list = useListPage({
    fetch: (p) => dispatch(fetchAll(p)),
    state,
    params: { method: debouncedMethod, start, end, ordering: ordering?.value, kind },
  })

  // The server builds the file from the same filters the list is showing.
  const handleExport = () => downloadFile(
      `${VENDOR_PAYMENTS_ENDPOINT}export/`,
      kind === "preorder" ? "pre-order-supplier-payments.csv" : "stock-vendor-payments.csv",
      list.query,
      true
    )

  return (
    <div className="section-container">
      <PageHeader
        title={title}
        actions={<ExportButton onExport={handleExport} />}
      />

      <FilterToolbar
        searchPlaceholder="Filter by exact method (e.g. Bank transfer)..."
        searchValue={method}
        onSearchChange={setMethod}
        datePicker={
          <DateRangeInputs start={start} end={end} onStartChange={setStart} onEndChange={setEnd} idPrefix="vendor-payments" />
        }
        filters={[{ component: <SortSelect options={SORT_OPTIONS} value={ordering} onChange={setOrdering} /> }]}
      />

      <DataTable
        columns={columns}
        data={state.data}
        {...list.tableProps}
        emptyIcon={Banknote}
        emptyTitle={kind === "preorder" ? "No supplier payments" : "No vendor payments"}
        minWidth="760px"
        columnWidths={["180px", "160px", "140px", "140px", "180px"]}
      />
    </div>
  )
}

const VendorPayments = () => <VendorPaymentsList key={useKind()} />

export default VendorPayments
