import type { Metadata } from "next";
import { PreOrderSections } from "../components/PreOrderSections";
import { JsonLd } from "../components/JsonLd";
import { breadcrumbJsonLd, pageMetadata } from "../lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Pre-order Collection",
  description:
    "Reserve upcoming Kull Mart products — earbuds, power banks and more — before regular stock arrives, with delivery all across Bangladesh.",
  path: "/pre-order",
});

export default function KullMartPreOrderPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Pre-order Collection", path: "/pre-order" },
        ])}
      />
      <PreOrderSections />
    </>
  );
}
