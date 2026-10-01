import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductDetailView } from "@/modules/catalog";
import { JsonLd } from "@/modules/seo";
import { breadcrumbJsonLd, pageMetadata, productJsonLd, truncate } from "@/modules/seo";
import { getCatalog, getProductBySlug } from "@/modules/catalog/server";
import { photo } from "@/lib/photo";

interface ProductPageProps {
  params: Promise<{
    slug: string;
  }>;
}

// Known products are pre-rendered; a product added in the admin later is rendered on first request (dynamicParams
// defaults to true) and an unknown slug still ends in a real 404 (notFound below).
export async function generateStaticParams() {
  const { products } = await getCatalog();
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  // Raised here as well as in the page: metadata is resolved before streaming starts, so an unknown slug gets a
  // real 404 status instead of a 200 "soft 404".
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
  const [product, { products }] = await Promise.all([getProductBySlug(slug), getCatalog()]);

  if (!product) {
    notFound();
  }

  const relatedProducts = products.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 4);

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
