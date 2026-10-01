import supplierReducer from "./slices/supplierSlice"
import purchaseOrderReducer from "./slices/purchaseOrderSlice"
import goodsReceiptReducer from "./slices/goodsReceiptSlice"
import vendorBillReducer from "./slices/vendorBillSlice"
import vendorPaymentReducer from "./slices/vendorPaymentSlice"

export const procurementReducers = {
  suppliers: supplierReducer,
  purchaseOrders: purchaseOrderReducer,
  goodsReceipts: goodsReceiptReducer,
  vendorBills: vendorBillReducer,
  vendorPayments: vendorPaymentReducer,
}
