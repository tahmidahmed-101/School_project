import { notFound } from "next/navigation";
import { PRODUCTS } from "../../lib/data";
import { ProductDetailView } from "../../components/ProductDetailView";
import type { Product } from "../../lib/types";

interface ProductPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateStaticParams() {
  return PRODUCTS.map((product: Product) => ({
    slug: product.slug,
  }));
}

export default async function KullMartProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = PRODUCTS.find((p: Product) => p.slug === slug);

  if (!product) {
    notFound();
  }

  return <ProductDetailView key={product.id} product={product} />;
}
