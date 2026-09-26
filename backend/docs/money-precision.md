# Numeric precision tiers

Every `DecimalField` in the backend belongs to one of the tiers below. Pick the
tier by what the number *is*, not by what the neighbouring column happens to use.

| Tier | Precision | Used for | Examples |
|---|---|---|---|
| Aggregate money | `14,2` | Any total, subtotal, balance, or amount that sums other money | `SalesOrder.total_amount`, `Payment.amount`, `JournalEntryLine.debit`, `PayrollRun.total_net`, `Payslip.gross_pay` |
| Unit money | `12,2` | A price or charge attached to a single unit or line | `ProductVariant.price`, `SalesOrderLine.unit_price`, `Payslip.overtime_rate` |
| Unit cost | `12,4` | Costing values where sub-cent rounding compounds across quantity | `PurchaseOrderLine.unit_cost`, `StockItem.avg_cost`, `StockLedgerEntry.unit_cost` |
| Percent | `5,2` | Rates expressed as a percentage, 0–100 | `TaxRate.rate_percent`, `BundleItem.discount_percent` |
| Weight | `10,3` | Kilograms | `ShippingRate.base_weight`, `ProductVariant.weight_kg` |
| Hours | `8,2` | Time quantities, not money | `Payslip.overtime_hours` |

Report-only annotations may widen to `20,4` to keep intermediate aggregation from
overflowing; that precision never reaches a column.

## Why payroll moved

`Payslip` and `SalaryStructure` money columns were `12,2` while `PayrollRun`
totals were already `14,2`, so a payroll aggregate was capped two digits lower
than an order total for no stated reason. All payroll money is now `14,2`;
`overtime_rate` dropped to the unit-money tier it belongs to.
