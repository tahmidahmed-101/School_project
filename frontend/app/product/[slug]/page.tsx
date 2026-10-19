import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductDetailView, forListing, moreForProduct, relatedForProduct } from "@/modules/catalog";
import { JsonLd } from "@/modules/seo";
import { breadcrumbJsonLd, pageMetadata, productJsonLd, truncate } from "@/modules/seo";
import { getCatalog, getProductBySlug, getRelatedProductsBySlug } from "@/modules/catalog/server";
import { photo } from "@/lib/photo";
import { PromotionPopup } from "@/modules/storefront";
import { getStorefrontContent } from "@/modules/storefront/server";

interface ProductPageProps {
  params: Promise<{
    slug: string;
  }>;
}

const RELATED_COUNT = 4;
// Two pages of the "More products" rail.
const MORE_COUNT = 12;

// Known products are pre-rendered; a product added in the admin later is rendered on first request (dynamicParams
// defaults to true) and an unknown slug still ends in a real 404 (notFound below).
export async function generateStaticParams() {
  const { products } = await getCatalog();
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  // Raised here as well as in the page. There is no loading.tsx on this route: a streamed skeleton would commit
  // a 200 status before the slug is looked up.
  if (!product) notFound();

  return pageMetadata({
    title: product.name.en,
    description: truncate(product.description.en || product.tagline.en || product.name.en),
    path: `/product/${product.slug}`,
    image: { url: photo(product.image), alt: product.name.en },
    keywords: product.metaKeywords,
  });
}

export default async function KullMartProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const [product, related, { products }, content] = await Promise.all([
    getProductBySlug(slug),
    getRelatedProductsBySlug(slug, RELATED_COUNT),
    getCatalog(),
    getStorefrontContent(),
  ]);

  if (!product) {
    notFound();
  }

  const relatedProducts = relatedForProduct(product, related, products, RELATED_COUNT);
  const moreProducts = moreForProduct(product, relatedProducts, products, MORE_COUNT).map(forListing);
  const shop =
    product.kind === "preorder"
      ? { name: "Pre-order Collection", path: "/pre-order" }
      : { name: "Shop", path: "/shop" };

  return (
    <>
      <JsonLd data={productJsonLd(product)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          shop,
          { name: product.name.en, path: `/product/${product.slug}` },
        ])}
      />
      <ProductDetailView
        key={product.id}
        product={product}
        relatedProducts={relatedProducts}
        moreProducts={moreProducts}
      />
      <PromotionPopup popups={content?.promotionPopups ?? []} shop={product.kind} />
    </>
  );
}
