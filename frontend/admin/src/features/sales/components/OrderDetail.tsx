import { useParams } from "react-router-dom"

import { useAppSelector } from "@/app/hooks"
import { fetchSingle, selectOrderDetail } from "@/features/sales/slices/orderSlice"
import { DetailPageState } from "@/components/common/DetailPageState"
import { useDetailLoad } from "@/hooks/use-detail-load"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { resolveDetailState } from "@/lib/detailState"
import { StockOrderDetail } from "./order/StockOrderDetail"

const OrderDetail = () => {
  const { id } = useParams<{ id: string }>()

  const singleData = useAppSelector(selectOrderDetail)
  const { singleStatus, singleError } = useAppSelector((state) => state.orders)
  const order = singleData && singleData.id === id ? singleData : null

  useDocumentTitle(order?.order_number ? `${order.order_number} — Order` : "Order Details")

  const refresh = useDetailLoad(fetchSingle, id)

  const pageState = resolveDetailState(singleStatus, singleError, !!order)
  if (pageState || !order) {
    return (
      <DetailPageState
        state={pageState ?? "loading"}
        entity="Order"
        backTo="/orders"
        backLabel="Back to orders"
        error={singleError}
        onRetry={refresh}
      />
    )
  }

  return <StockOrderDetail order={order} refresh={refresh} />
}

export default OrderDetail
