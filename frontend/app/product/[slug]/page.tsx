import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductDetailView } from "@/modules/catalog";
import { JsonLd } from "@/modules/seo";
import { breadcrumbJsonLd, pageMetadata, productJsonLd, truncate } from "@/modules/seo";
import { getCatalog, getProductBySlug, getRelatedProductsBySlug } from "@/modules/catalog/server";
import { photo } from "@/lib/photo";

interface ProductPageProps {
  params: Promise<{
    slug: string;
  }>;
}

const RELATED_COUNT = 4;

// Known products are pre-rendered; a product added in the admin later is rendered on first request (dynamicParams
// defaults to true) and an unknown slug still ends in a real 404 (notFound below).
export async function generateStaticParams() {
  const { products } = await getCatalog();
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  // Raised here as well as in the page. With loading.tsx the response starts streaming the skeleton before this
  // resolves, so an unknown slug answers 200 with the not-found page and a noindex tag rather than a 404 status.
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
  const [product, related, { products }] = await Promise.all([
    getProductBySlug(slug),
    getRelatedProductsBySlug(slug, RELATED_COUNT),
    getCatalog(),
  ]);

  if (!product) {
    notFound();
  }

  // The API ranks related products; if that call failed, fall back to others from the same category.
  const relatedProducts =
    related ?? products.filter((p) => p.category === product.category && p.id !== product.id).slice(0, RELATED_COUNT);

  return (
    <>
      <JsonLd data={productJsonLd(product)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Shop", path: "/shop" },
          { name: product.name.en, path: `/product/${product.slug}` },
        ])}
      />
      <ProductDetailView key={product.id} product={product} relatedProducts={relatedProducts} />
    </>
  );
}
