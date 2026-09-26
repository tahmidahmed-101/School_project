import type { Metadata } from "next";
import { TrackOrderView } from "../components/TrackOrderView";

// Per-visitor lookup, no unique content to index (mirrors /checkout: robots.txt disallows it too).
export const metadata: Metadata = {
  title: "Track Order",
  description: "Track your Kull Mart order by entering your order number and phone number.",
  robots: { index: false, follow: false },
};

export default function KullMartTrackOrderPage() {
  return <TrackOrderView />;
}
