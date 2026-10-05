import type { Metadata } from "next";
import { HomeSections, homeProducts } from "@/modules/storefront";
import { ProductsProvider } from "@/modules/catalog";
import { getCatalog } from "@/modules/catalog/server";
import { getVouchers } from "@/modules/marketing/server";
import { SITE_DESCRIPTION, pageMetadata } from "@/modules/seo";

// No title: the layout's default title is used as-is on the home page.
export const metadata: Metadata = pageMetadata({ description: SITE_DESCRIPTION, path: "/" });

export default async function KullMartHomePage() {
  const [{ products }, vouchers] = await Promise.all([getCatalog(), getVouchers()]);
  return (
    <ProductsProvider products={homeProducts(products)}>
      <HomeSections vouchers={vouchers} />
    </ProductsProvider>
  );
}
