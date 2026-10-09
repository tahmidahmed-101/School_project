import type { Metadata } from "next";
import { HomeSections, hasDiscountedProduct, homeProducts } from "@/modules/storefront";
import { getStorefrontContent } from "@/modules/storefront/server";
import { ProductsProvider, forListing } from "@/modules/catalog";
import { getCatalog } from "@/modules/catalog/server";
import { getVouchers } from "@/modules/marketing/server";
import { SITE_DESCRIPTION, pageMetadata } from "@/modules/seo";

// No title: the layout's default title is used as-is on the home page.
export const metadata: Metadata = pageMetadata({ description: SITE_DESCRIPTION, path: "/" });

export default async function KullMartHomePage() {
  const [{ products }, vouchers, content] = await Promise.all([getCatalog(), getVouchers(), getStorefrontContent()]);
  return (
    <ProductsProvider products={homeProducts(products).map(forListing)}>
      <HomeSections vouchers={vouchers} content={content} hasOffers={hasDiscountedProduct(products)} />
    </ProductsProvider>
  );
}
