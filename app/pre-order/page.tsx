import { Suspense } from "react";
import type { Metadata } from "next";
import { PreOrderCatalog } from "../components/PreOrderCatalog";
import { Loader } from "../components/Loader";

export const metadata: Metadata = {
  title: "Pre-order Collection | Kull Mart",
  description: "Reserve upcoming Kull Mart products before regular stock arrives.",
};

export default function KullMartPreOrderPage() {
  return (
    <Suspense fallback={<Loader variant="page" />}>
      <PreOrderCatalog />
    </Suspense>
  );
}
