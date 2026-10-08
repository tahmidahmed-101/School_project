import type { T } from "@/lib/types";

/** Customer wording for the backend's pre-order stages (apps/orders/models/preorder_stage.py). */
const PREORDER_STAGES: Record<string, T> = {
  pending_payment: { en: "Pending payment", bn: "পেমেন্ট বাকি" },
  partially_paid: { en: "Partially paid", bn: "আংশিক পেমেন্ট হয়েছে" },
  purchasing: { en: "Purchasing", bn: "কেনা হচ্ছে" },
  purchase_completed: { en: "Purchase completed", bn: "কেনা শেষ" },
  shipped_from_supplier: { en: "Shipped from supplier", bn: "সাপ্লায়ার পাঠিয়ে দিয়েছে" },
  received_in_china_warehouse: { en: "Received in China warehouse", bn: "চীনের ওয়্যারহাউসে পৌঁছেছে" },
  on_the_way_to_china_airport: { en: "On the way to China airport", bn: "চীনের এয়ারপোর্টের পথে" },
  received_in_china_airport: { en: "Received in China airport", bn: "চীনের এয়ারপোর্টে পৌঁছেছে" },
  on_the_way_to_bd_airport: { en: "On the way to BD airport", bn: "বাংলাদেশের এয়ারপোর্টের পথে" },
  received_in_bd_airport: { en: "Received in BD airport", bn: "বাংলাদেশের এয়ারপোর্টে পৌঁছেছে" },
  on_the_way_to_china_seaport: { en: "On the way to China seaport", bn: "চীনের সমুদ্রবন্দরের পথে" },
  received_in_china_seaport: { en: "Received in China seaport", bn: "চীনের সমুদ্রবন্দরে পৌঁছেছে" },
  on_the_way_to_bd_seaport: { en: "On the way to BD seaport", bn: "বাংলাদেশের সমুদ্রবন্দরের পথে" },
  received_in_bd_seaport: { en: "Received in BD seaport", bn: "বাংলাদেশের সমুদ্রবন্দরে পৌঁছেছে" },
  offload: { en: "Offload", bn: "আনলোড হচ্ছে" },
  inspection: { en: "Inspection", bn: "চেকিং চলছে" },
  on_the_way_to_bd_warehouse: { en: "On the way to BD warehouse", bn: "বাংলাদেশের ওয়্যারহাউসের পথে" },
  received_in_bd_warehouse: { en: "Received in BD warehouse", bn: "বাংলাদেশের ওয়্যারহাউসে পৌঁছেছে" },
  waiting_for_receive_due_payment: { en: "Waiting for receive due payment", bn: "বাকি পেমেন্টের অপেক্ষায়" },
  processing_for_delivery: { en: "Processing for delivery", bn: "ডেলিভারির প্রস্তুতি চলছে" },
  on_the_way_to_delivery: { en: "On the way to delivery", bn: "ডেলিভারির পথে" },
  completed: { en: "Completed", bn: "অর্ডার সম্পন্ন" },
  hold: { en: "Hold", bn: "হোল্ডে আছে" },
  cancelled: { en: "Cancelled", bn: "বাতিল হয়েছে" },
};

/** A stage this build does not know yet is shown as the backend named it rather than hidden. */
export function preorderStageLabel(stage: string): T {
  return PREORDER_STAGES[stage] ?? { en: stage.replaceAll("_", " "), bn: "" };
}
