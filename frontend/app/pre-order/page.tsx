import type { Metadata } from "next";
import { PreOrderSections } from "@/modules/storefront";
import { JsonLd } from "@/modules/seo";
import { ProductsProvider, forListing } from "@/modules/catalog";
import { getCatalog } from "@/modules/catalog/server";
import { getVouchers } from "@/modules/marketing/server";
import { breadcrumbJsonLd, pageMetadata } from "@/modules/seo";

export const metadata: Metadata = pageMetadata({
  title: "Pre-order Collection",
  description: "Reserve upcoming Kull Mart products before regular stock arrives, with delivery all across Bangladesh.",
  path: "/pre-order",
});

export default async function KullMartPreOrderPage() {
  const [{ products }, vouchers] = await Promise.all([getCatalog(), getVouchers()]);
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Pre-order Collection", path: "/pre-order" },
        ])}
      />
      <ProductsProvider products={products.filter((product) => product.isPreOrder).map(forListing)}>
        <PreOrderSections vouchers={vouchers} />
      </ProductsProvider>
    </>
  );
}
