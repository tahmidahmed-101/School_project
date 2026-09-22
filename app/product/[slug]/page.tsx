import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PRODUCTS } from "../../lib/data";
import { ProductDetailView } from "../../components/ProductDetailView";
import { JsonLd } from "../../components/JsonLd";
import { breadcrumbJsonLd, pageMetadata, productJsonLd, truncate } from "../../lib/seo";
import { photo } from "../../lib/photo";
import type { Product } from "../../lib/types";

interface ProductPageProps {
  params: Promise<{
    slug: string;
  }>;
}

// Every slug is known at build time, so unknown ones get a real 404 status rather than a streamed 200 "soft 404".
export const dynamicParams = false;

export async function generateStaticParams() {
  return PRODUCTS.map((product: Product) => ({
    slug: product.slug,
  }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = PRODUCTS.find((p: Product) => p.slug === slug);
  if (!product) return {};

  return pageMetadata({
    title: product.name.en,
    description: truncate(product.description.en),
    path: `/product/${product.slug}`,
    image: { url: photo(product.image), alt: product.name.en },
  });
}

export default async function KullMartProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = PRODUCTS.find((p: Product) => p.slug === slug);

  if (!product) {
    notFound();
  }

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
      <ProductDetailView key={product.id} product={product} />
    </>
  );
}
