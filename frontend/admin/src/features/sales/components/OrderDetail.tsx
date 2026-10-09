import { useParams } from "react-router-dom"

import { useAppSelector } from "@/app/hooks"
import { fetchSingle, selectOrderDetail } from "@/features/sales/slices/orderSlice"
import { DetailPageState } from "@/components/common/DetailPageState"
import { useDetailLoad } from "@/hooks/use-detail-load"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useKindHint, useRecordKind } from "@/hooks/use-kind"
import { KIND_PATHS } from "../shared/kindPaths"
import { resolveDetailState } from "@/lib/detailState"
import { PreorderOrderDetail } from "./order/PreorderOrderDetail"
import { StockOrderDetail } from "./order/StockOrderDetail"

/** One route for both kinds: the order's own order_type picks the layout, never the URL. */
const OrderDetail = () => {
  const { id } = useParams<{ id: string }>()

  const singleData = useAppSelector(selectOrderDetail)
  const { singleStatus, singleError } = useAppSelector((state) => state.orders)
  const order = singleData && singleData.id === id ? singleData : null
  const isPreorder = order?.order_type === "preorder"
  const hint = useKindHint()
  useRecordKind(order?.order_type)

  useDocumentTitle(order?.order_number ? `${order.order_number} — ${isPreorder ? "Pre-order" : "Order"}` : "Order Details")

  const refresh = useDetailLoad(fetchSingle, id)

  const pageState = resolveDetailState(singleStatus, singleError, !!order)
  if (pageState || !order) {
    return (
      <DetailPageState
        state={pageState ?? "loading"}
        entity={hint === "preorder" ? "Pre-order" : "Order"}
        backTo={hint && KIND_PATHS[hint].orders}
        backLabel={hint === "preorder" ? "Back to pre-orders" : "Back to orders"}
        error={singleError}
        onRetry={refresh}
      />
    )
  }

  return isPreorder ? (
    <PreorderOrderDetail order={order} refresh={refresh} />
  ) : (
    <StockOrderDetail order={order} refresh={refresh} />
  )
}

export default OrderDetail
