import { Suspense } from "react";
import type { Metadata } from "next";
import { ShopCatalog, ShopSkeleton } from "@/modules/catalog";
import { JsonLd } from "@/modules/seo";
import { ProductsProvider, forListing } from "@/modules/catalog";
import { getCatalog } from "@/modules/catalog/server";
import { breadcrumbJsonLd, categoryDescription, ogCardImage, pageMetadata } from "@/modules/seo";
import { photo } from "@/lib/photo";
import { PromotionPopup } from "@/modules/storefront";
import { getStorefrontContent } from "@/modules/storefront/server";

type ShopSearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/** The category a `?category=` URL points at, if it names a real one. Other filters (sort, search) never change the page identity. */
async function categoryFrom(searchParams: ShopSearchParams) {
  const { category } = await searchParams;
  if (typeof category !== "string") return undefined;
  const { categories } = await getCatalog();
  return categories.find((c) => c.slug === category);
}

export async function generateMetadata({ searchParams }: { searchParams: ShopSearchParams }): Promise<Metadata> {
  const category = await categoryFrom(searchParams);
  if (category) {
    return pageMetadata({
      title: `Shop ${category.name.en}`,
      description: categoryDescription(category),
      path: `/shop?category=${category.slug}`,
      image: ogCardImage("category", category.slug, photo(category.image), category.name.en),
    });
  }
  return pageMetadata({
    title: "Shop In-Stock Products",
    description:
      "Browse the School Project in-stock collection — women's fashion, bags, jewellery, kids' items and gadgets. Filter by category and price; delivery across Bangladesh.",
    path: "/shop",
  });
}

export default async function SchoolProjectShopPage({ searchParams }: { searchParams: ShopSearchParams }) {
  const [category, { products }, content] = await Promise.all([
    categoryFrom(searchParams),
    getCatalog(),
    getStorefrontContent(),
  ]);
  const trail = [
    { name: "Home", path: "/" },
    { name: "Shop", path: "/shop" },
    ...(category ? [{ name: category.name.en, path: `/shop?category=${category.slug}` }] : []),
  ];

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(trail)} />
      <Suspense fallback={<ShopSkeleton />}>
        <ProductsProvider products={products.map(forListing)}>
          <ShopCatalog />
        </ProductsProvider>
      </Suspense>
      <PromotionPopup popups={content?.promotionPopups ?? []} />
    </>
  );
}
