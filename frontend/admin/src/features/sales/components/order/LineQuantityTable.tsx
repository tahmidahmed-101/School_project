import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-center">{maxLabel}</TableHead>
            <TableHead className="w-[110px] text-right">Quantity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => {
            const max = maxFor(line)
            const raw = values[line.id] ?? ""
            const invalid = raw !== "" && (Number(raw) < 0 || Number(raw) > max || !Number.isInteger(Number(raw)))
            return (
              <TableRow key={line.id}>
                <TableCell>
                  <p className="text-sm font-medium">{line.product_name}</p>
                  <p className="font-mono text-xs uppercase text-muted-foreground">{line.variant_sku}</p>
                </TableCell>
                <TableCell className="text-center text-sm">{max}</TableCell>
                <TableCell className="text-right">
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
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
