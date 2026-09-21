import type { OrderForm } from "./types";

export const DELIVERY_FEE = { inside: 60, outside: 120 } as const;

const INSIDE_DHAKA_DISTRICTS = ["dhaka"];

export function getDeliveryZone(district: string): OrderForm["deliveryZone"] {
  return INSIDE_DHAKA_DISTRICTS.includes(district.toLowerCase())
    ? "inside-dhaka"
    : "outside-dhaka";
}

export function getDeliveryFee(zone: OrderForm["deliveryZone"], isFreeDelivery: boolean): number {
  if (isFreeDelivery) return 0;
  return zone === "inside-dhaka" ? DELIVERY_FEE.inside : DELIVERY_FEE.outside;
}
