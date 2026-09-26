import type { Metadata } from "next";
import { CheckoutView } from "../components/CheckoutView";

// Checkout is a private, per-visitor step: keep it out of search results (robots.txt disallows it as well).
export const metadata: Metadata = {
  title: "Checkout",
  description: "Complete your Kull Mart order: enter your delivery details and choose how to pay.",
  robots: { index: false, follow: false },
};

export default function KullMartCheckoutPage() {
  return <CheckoutView />;
}
