import type { Metadata } from "next";
import { PreOrderSections } from "@/modules/storefront";
import { JsonLd } from "@/modules/seo";
import { ProductsProvider } from "@/modules/catalog";
import { getCatalog } from "@/modules/catalog/server";
import { breadcrumbJsonLd, pageMetadata } from "@/modules/seo";

export const metadata: Metadata = pageMetadata({
  title: "Pre-order Collection",
  description:
    "Reserve upcoming Kull Mart products — earbuds, power banks and more — before regular stock arrives, with delivery all across Bangladesh.",
  path: "/pre-order",
});

export default async function KullMartPreOrderPage() {
  const { products } = await getCatalog();
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Pre-order Collection", path: "/pre-order" },
        ])}
      />
      <ProductsProvider products={products}>
        <PreOrderSections />
      </ProductsProvider>
    </>
  );
}
