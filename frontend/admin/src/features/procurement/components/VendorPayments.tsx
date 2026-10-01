import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { Banknote, DownloadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { PageHeading } from "@/components/common/PageHeading"
import { exportToCSV } from "@/lib/ExportToCsv"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { useAppDispatch } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"

import { fetchAll } from "../slices/vendorPaymentSlice"
import type { VendorPayment } from "../types"
import { useDebouncedValue, useProcurementSelector } from "../hooks/useProcurement"

const PAGE_SIZE = 20
type Option = { label: string; value: string }

const VendorPayments = () => {
  useDocumentTitle("Vendor Payments")
  const dispatch = useAppDispatch()
  const { data, isFetchingList, error, totalItems, meta } = useProcurementSelector((state) => state.vendorPayments)

  const [page, setPage] = useState(1)
  const [method, setMethod] = useState("")
  const debouncedMethod = useDebouncedValue(method)
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [ordering, setOrdering] = useState<Option | null>(null)

  const load = useCallback(
    () =>
      dispatch(
        fetchAll({
          page,
          page_size: PAGE_SIZE,
          ...(debouncedMethod ? { method: debouncedMethod } : {}),
          ...(start ? { start } : {}),
          ...(end ? { end } : {}),
          ...(ordering ? { ordering: ordering.value } : {}),
        })
      ),
    [dispatch, page, debouncedMethod, start, end, ordering]
  )

  useEffect(() => {
    const request = load()
    return () => request.abort()
  }, [load])

  const columns: ColumnDef<VendorPayment>[] = [
    {
      accessorKey: "paid_at",
      header: "PAID AT",
      cell: ({ row }) => <span className="text-sm text-muted-foreground whitespace-nowrap">{formatDateTime(row.original.paid_at)}</span>,
    },
    {
      accessorKey: "vendor_bill_number",
      header: "BILL",
      cell: ({ row }) => (
        <Link to="/purchasing/bills" className="font-mono text-sm font-semibold text-primary hover:underline">
          {row.original.vendor_bill_number}
        </Link>
      ),
    },
    {
      accessorKey: "amount",
      header: "AMOUNT",
      cell: ({ row }) => <span className="text-sm font-semibold tabular-nums">{formatCurrency(row.original.amount)}</span>,
    },
    {
      accessorKey: "method",
      header: "METHOD",
      cell: ({ row }) => <span className="text-sm">{row.original.method || "—"}</span>,
    },
    {
      accessorKey: "reference",
      header: "REFERENCE",
      cell: ({ row }) => <span className="text-xs font-mono text-muted-foreground">{row.original.reference || "—"}</span>,
    },
  ]

  const csvData = data.map((p) => ({
    PaidAt: p.paid_at,
    Bill: p.vendor_bill_number,
    Amount: p.amount,
    Method: p.method,
    Reference: p.reference,
  }))

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading
          title="Vendor Payments"
          description="Money paid to suppliers. Record new payments from a vendor bill."
        />
        <Button variant="primary" size="action" onClick={() => exportToCSV(csvData, "VendorPayments")}>
          <DownloadIcon className="size-5" /> Export CSV
        </Button>
      </div>

      <FilterToolbar
        searchPlaceholder="Filter by exact method (e.g. Bank transfer)..."
        searchValue={method}
        onSearchChange={(v) => {
          setMethod(v)
          setPage(1)
        }}
        datePicker={
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="Paid from"
              value={start}
              max={end || undefined}
              onChange={(e) => {
                setStart(e.target.value)
                setPage(1)
              }}
              className="h-11 w-[150px]"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="date"
              aria-label="Paid to"
              value={end}
              min={start || undefined}
              onChange={(e) => {
                setEnd(e.target.value)
                setPage(1)
              }}
              className="h-11 w-[150px]"
            />
          </div>
        }
        filters={[
          {
            component: (
              <ExampleComboboxCustomItems
                frameworks={[
                  { label: "Newest first", value: "-paid_at" },
                  { label: "Oldest first", value: "paid_at" },
                  { label: "Amount: high to low", value: "-amount" },
                  { label: "Amount: low to high", value: "amount" },
                ]}
                placeholder="Sort"
                value={ordering}
                onValueChange={(v) => {
                  setOrdering(v)
                  setPage(1)
                }}
              />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={isFetchingList}
        error={error}
        onRetry={() => {
          load()
        }}
        manualPagination
        pageSize={PAGE_SIZE}
        pageIndex={page - 1}
        pageCount={meta?.totalPages ?? 1}
        totalCount={totalItems}
        onPageChange={(index) => setPage(index + 1)}
        emptyIcon={Banknote}
        emptyTitle="No vendor payments"
        minWidth="760px"
        columnWidths={["180px", "160px", "140px", "140px", "180px"]}
      />
    </div>
  )
}

export default VendorPayments
