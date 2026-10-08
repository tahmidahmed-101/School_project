import type { Metadata } from "next";
import { PreOrderSections, hasDiscountedProduct } from "@/modules/storefront";
import { getStorefrontContent } from "@/modules/storefront/server";
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
  const [{ products }, vouchers, content] = await Promise.all([getCatalog(), getVouchers(), getStorefrontContent()]);
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Pre-order Collection", path: "/pre-order" },
        ])}
      />
      <ProductsProvider products={products.filter((product) => product.isPreOrder).map(forListing)}>
        <PreOrderSections vouchers={vouchers} content={content} hasOffers={hasDiscountedProduct(products)} />
      </ProductsProvider>
    </>
  );
}
