import type { ColumnDef } from "@tanstack/react-table"
import { Input } from "@/components/ui/input"
import { ProductCell } from "@/components/common/cells"
import { DataTable } from "@/components/common/data-table"
import type { OrderLine } from "@/features/sales/types"

interface LineQuantityTableProps {
  lines: OrderLine[]
  /** Upper bound per line (e.g. shippable_quantity / returnable_quantity). */
  maxFor: (line: OrderLine) => number
  maxLabel: string
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
}

/** Pick how many units of each order line go into a shipment or return. */
export function LineQuantityTable({ lines, maxFor, maxLabel, values, onChange }: LineQuantityTableProps) {
  const columns: ColumnDef<OrderLine>[] = [
    {
      id: "product",
      header: "Product",
      cell: ({ row }) => <ProductCell name={row.original.product_name} sku={row.original.variant_sku} />,
    },
    {
      id: "max",
      header: maxLabel,
      meta: { align: "center" },
      cell: ({ row }) => <span className="text-sm">{maxFor(row.original)}</span>,
    },
    {
      id: "quantity",
      header: "Quantity",
      meta: { align: "right" },
      cell: ({ row: { original: line } }) => {
        const max = maxFor(line)
        const raw = values[line.id] ?? ""
        const invalid = raw !== "" && (Number(raw) < 0 || Number(raw) > max || !Number.isInteger(Number(raw)))
        return (
          <Input
            type="number"
            min={0}
            max={max}
            step={1}
            disabled={max === 0}
            aria-label={`Quantity for ${line.product_name}`}
            aria-invalid={invalid}
            className="h-8 text-right"
            value={raw}
            onChange={(e) => onChange({ ...values, [line.id]: e.target.value })}
          />
        )
      },
    },
  ]

  return (
    <DataTable
      surface="card"
      showPagination={false}
      selectable={false}
      columns={columns}
      data={lines}
      minWidth="0px"
      columnWidths={["auto", "120px", "110px"]}
    />
  )
}
