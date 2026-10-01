// Mirrors kull-mart api/v1/admin/procurement/serializers.py. Decimals arrive as strings.

/** SupplierSerializer */
export interface Supplier {
  id: string
  name: string
  contact_email: string
  phone: string
  payment_terms: string
  is_active: boolean
  deleted_at: string | null
}

/** SupplierCreateSerializer / SupplierUpdateSerializer */
export interface SupplierPayload {
  name?: string
  contact_email?: string
  phone?: string
  payment_terms?: string
  is_active?: boolean
}

export type PurchaseOrderStatus = "draft" | "submitted" | "received" | "cancelled"

/** PurchaseOrderLineSerializer */
export interface PurchaseOrderLine {
  id: string
  variant_id: string
  variant_sku: string
  product_name: string
  product_image: string | null
  quantity_ordered: number
  quantity_received: number
  unit_cost: string
}

/** PurchaseOrderLineInputSerializer (create / add line) */
export interface PurchaseOrderLineInput {
  variant_id: string
  quantity_ordered: number
  unit_cost: string
}

/** PurchaseOrderLineUpdateSerializer */
export type PurchaseOrderLineUpdate = Partial<PurchaseOrderLineInput>

/** PurchaseOrderSerializer */
export interface PurchaseOrder {
  id: string
  po_number: string
  supplier_id: string
  supplier_name: string
  status: PurchaseOrderStatus
  order_date: string
  notes: string
  lines: PurchaseOrderLine[]
}

/** PurchaseOrderCreateSerializer */
export interface PurchaseOrderCreatePayload {
  supplier_id: string
  order_date: string
  notes?: string
  lines: PurchaseOrderLineInput[]
}

/** PurchaseOrderUpdateSerializer — header fields only editable while draft. */
export interface PurchaseOrderUpdatePayload {
  supplier_id?: string
  order_date?: string
  notes?: string
  status?: PurchaseOrderStatus
}

export type GoodsReceiptStatus = "pending" | "qc_pass" | "qc_reject"
export type GRNLineCondition = "accepted" | "rejected"

/** GRNLineSerializer */
export interface GRNLine {
  id: string
  purchase_order_line_id: string
  quantity_received: number
  condition: GRNLineCondition
}

/** GoodsReceiptNoteSerializer */
export interface GoodsReceipt {
  id: string
  purchase_order_id: string
  purchase_order_number: string
  received_date: string
  received_by_id: string | null
  status: GoodsReceiptStatus
  lines: GRNLine[]
}

/** GoodsReceiptCreateSerializer */
export interface GoodsReceiptCreatePayload {
  purchase_order_id: string
  received_date: string
  lines: { purchase_order_line_id: string; quantity_received: number; condition: GRNLineCondition }[]
}

export type VendorBillStatus = "unpaid" | "paid" | "overdue" | "void"

/** VendorPaymentSerializer */
export interface VendorPayment {
  id: string
  vendor_bill_id: string
  vendor_bill_number: string
  amount: string
  paid_at: string
  method: string
  reference: string
}

/** VendorPaymentCreateSerializer */
export interface VendorPaymentCreatePayload {
  amount: string
  paid_at: string
  method?: string
  reference?: string
}

/** VendorBillSerializer */
export interface VendorBill {
  id: string
  bill_number: string
  purchase_order_id: string
  purchase_order_number: string
  supplier_id: string
  supplier_name: string
  amount: string
  due_date: string
  status: VendorBillStatus
  payments: VendorPayment[]
}

/** VendorBillCreateSerializer — amount must 3-way match the PO's received value. */
export interface VendorBillCreatePayload {
  purchase_order_id: string
  supplier_id: string
  amount: string
  due_date: string
}

/** VendorBillUpdateSerializer */
export interface VendorBillUpdatePayload {
  amount?: string
  due_date?: string
}

/** Subset of the catalog ProductVariantSerializer used by the PO line picker. */
export interface VariantOption {
  id: string
  product_name: string
  sku: string
  color: string
  size: string
  cost_price: string | null
  primary_image: string | null
  stock: number
}
