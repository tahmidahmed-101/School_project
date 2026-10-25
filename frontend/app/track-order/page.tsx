import type { Metadata } from "next";
import { TrackOrderView } from "@/modules/tracking";

// Per-visitor lookup, no unique content to index (mirrors /checkout: robots.txt disallows it too).
export const metadata: Metadata = {
  title: "Track Order",
  description: "Track your Kull Mart order by entering your order number and phone number.",
  robots: { index: false, follow: false },
};

export default async function KullMartTrackOrderPage({
  searchParams,
}: {
  // `order` is set by the account page's "Track order" link (the order's id).
  searchParams: Promise<{ order?: string | string[] }>;
}) {
  const { order } = await searchParams;
  return <TrackOrderView orderId={typeof order === "string" ? order : undefined} />;
}
