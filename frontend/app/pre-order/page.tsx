import type { Metadata } from "next";
import { PreOrderSections, hasDiscountedProduct } from "@/modules/storefront";
import { getStorefrontContent } from "@/modules/storefront/server";
import { JsonLd } from "@/modules/seo";
import { ProductsProvider, forListing } from "@/modules/catalog";
import { getCatalog } from "@/modules/catalog/server";
import { isPreOrderShopProduct } from "@/lib/product";
import { breadcrumbJsonLd, pageMetadata } from "@/modules/seo";

export const metadata: Metadata = pageMetadata({
  title: "Pre-order Collection",
  description: "Reserve upcoming Kull Mart products before regular stock arrives, with delivery all across Bangladesh.",
  path: "/pre-order",
});

export default async function KullMartPreOrderPage() {
  const [{ products }, content] = await Promise.all([getCatalog(), getStorefrontContent()]);
  const preorderProducts = products.filter(isPreOrderShopProduct);
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Pre-order Collection", path: "/pre-order" },
        ])}
      />
      <ProductsProvider products={preorderProducts.map(forListing)}>
        <PreOrderSections content={content} hasOffers={hasDiscountedProduct(preorderProducts)} />
      </ProductsProvider>
    </>
  );
}
