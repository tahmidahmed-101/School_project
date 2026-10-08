import type { Metadata } from "next";
import { CheckoutView } from "@/modules/checkout";
import { getPaymentMethods } from "@/modules/checkout/server";

// Checkout is a private, per-visitor step: keep it out of search results (robots.txt disallows it as well).
export const metadata: Metadata = {
  title: "Checkout",
  description: "Complete your Kull Mart order: enter your delivery details and choose how to pay.",
  robots: { index: false, follow: false },
};

export default async function KullMartCheckoutPage() {
  return <CheckoutView paymentMethods={await getPaymentMethods()} />;
}
