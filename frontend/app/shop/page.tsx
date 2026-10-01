import { Suspense } from "react";
import type { Metadata } from "next";
import { ShopCatalog, ShopSkeleton } from "@/modules/catalog";
import { JsonLd } from "@/modules/seo";
import { ProductsProvider } from "@/modules/catalog";
import { getCatalog } from "@/modules/catalog/server";
import { breadcrumbJsonLd, pageMetadata } from "@/modules/seo";
import { photo } from "@/lib/photo";

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
  const { type } = await searchParams;
  if (!category && type === "preorder") {
    return pageMetadata({
      title: "Pre-order Products",
      description:
        "Reserve upcoming Kull Mart arrivals with pre-order — fashion, bags, jewellery, kids' items and gadgets, delivered across Bangladesh.",
      path: "/shop?type=preorder",
      canonical: "/pre-order",
    });
  }
  if (category) {
    // A pre-order category only has products under `?type=preorder`; the plain URL shows none.
    const path =
      category.type === "preorder"
        ? `/shop?category=${category.slug}&type=preorder`
        : `/shop?category=${category.slug}`;
    return pageMetadata({
      title: `Shop ${category.name.en}`,
      description: `${category.description.en ? `${category.description.en}. ` : `${category.name.en} — `}Shop online at Kull Mart with delivery all across Bangladesh.`,
      path,
      image: { url: photo(category.image), alt: category.name.en },
    });
  }
  return pageMetadata({
    title: "Shop In-Stock Products",
    description:
      "Browse the Kull Mart in-stock collection — women's fashion, bags, jewellery, kids' items and gadgets. Filter by category and price; delivery all across Bangladesh.",
    path: "/shop",
  });
}

export default async function KullMartShopPage({ searchParams }: { searchParams: ShopSearchParams }) {
  const [category, { products }] = await Promise.all([categoryFrom(searchParams), getCatalog()]);
  const trail = [
    { name: "Home", path: "/" },
    { name: "Shop", path: "/shop" },
    ...(category
      ? [
          {
            name: category.name.en,
            path:
              category.type === "preorder"
                ? `/shop?category=${category.slug}&type=preorder`
                : `/shop?category=${category.slug}`,
          },
        ]
      : []),
  ];

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(trail)} />
      <Suspense fallback={<ShopSkeleton />}>
        <ProductsProvider products={products}>
          <ShopCatalog />
        </ProductsProvider>
      </Suspense>
    </>
  );
}
