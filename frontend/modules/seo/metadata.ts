import type { Metadata } from "next";
import { BRAND_INFO, type BrandInfo } from "@/lib/brand";
import { photo } from "@/lib/photo";
import { isPreOrderSoldOut } from "@/lib/product";
import { absoluteUrl } from "@/lib/site-url";
import type { Product } from "@/lib/types";

export const SITE_NAME = BRAND_INFO.name;
export const SITE_TITLE = `${SITE_NAME} — Women's Fashion, Innerwear, Kids & Gadgets`;
export const SITE_DESCRIPTION =
  "Kull Mart, Dhaka — women's fashion, innerwear, kids' items and gadgets. Wholesale & retail with delivery all across Bangladesh.";
export const CURRENCY_CODE = "BDT";

interface SocialImage {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}

const DEFAULT_SOCIAL_IMAGE: SocialImage = {
  url: "/brand/og-default.jpg",
  alt: SITE_TITLE,
  width: 1200,
  height: 630,
};

/** Trims to the last whole word inside `max` characters, adding an ellipsis when it cut anything. */
export function truncate(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : cut.length).replace(/[\s,;:.-]+$/, "")}…`;
}

interface SocialOptions {
  title: string;
  description: string;
  /** Site path this page lives at; omitted for the site-wide defaults. */
  path?: string;
  image?: SocialImage;
}

/** Open Graph + Twitter card metadata. Pages must repeat this in full: a page-level `openGraph` replaces the layout's. */
export function socialMetadata({
  title,
  description,
  path,
  image = DEFAULT_SOCIAL_IMAGE,
}: SocialOptions): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      alternateLocale: ["bn_BD"],
      ...(path ? { url: path } : {}),
      title,
      description,
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

interface PageMetadataOptions {
  /** Page title; the layout template appends the brand. Omit for the site default title. */
  title?: string;
  description: string;
  path: string;
  /** Canonical URL when it differs from `path` (e.g. a filtered view of a page that has its own URL). */
  canonical?: string;
  image?: SocialImage;
  /** Comma-separated keywords, e.g. a product's `meta_keywords`. Blank entries are dropped. */
  keywords?: string;
}

/** Title, description, canonical URL and social cards for an indexable page. */
export function pageMetadata({ title, description, path, canonical, image, keywords }: PageMetadataOptions): Metadata {
  const keywordList = (keywords ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  return {
    ...(title ? { title } : {}),
    description,
    ...(keywordList.length ? { keywords: keywordList } : {}),
    alternates: { canonical: canonical ?? path },
    ...socialMetadata({ title: title ? `${title} | ${SITE_NAME}` : SITE_TITLE, description, path, image }),
  };
}

type JsonLdNode = Record<string, unknown>;

/** Absolute URL for a catalogue asset; remote images are already absolute. */
function assetUrl(path: string): string {
  const src = photo(path);
  return src.startsWith("http") ? src : absoluteUrl(src);
}

export function organizationJsonLd(brand: BrandInfo = BRAND_INFO): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    legalName: brand.legalName,
    url: absoluteUrl("/"),
    logo: assetUrl(brand.logo),
    image: absoluteUrl(DEFAULT_SOCIAL_IMAGE.url),
    description: SITE_DESCRIPTION,
    email: brand.email,
    telephone: brand.phoneInternational,
    sameAs: [brand.facebook],
    address: {
      "@type": "PostalAddress",
      addressLocality: brand.city,
      addressCountry: "BD",
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer service",
        telephone: brand.phoneInternational,
        email: brand.email,
        areaServed: "BD",
        availableLanguage: ["English", "Bengali"],
      },
    ],
  };
}

export function websiteJsonLd(): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    inLanguage: ["en", "bn"],
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${absoluteUrl("/shop")}?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(trail: { name: string; path: string }[]): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

function availabilityOf(product: Product): string {
  const soldOut = product.isPreOrder ? isPreOrderSoldOut(product) : !product.inStock || product.stockCount <= 0;
  if (soldOut) return "https://schema.org/OutOfStock";
  return product.isPreOrder ? "https://schema.org/PreOrder" : "https://schema.org/InStock";
}

export function productJsonLd(product: Product): JsonLdNode {
  const url = absoluteUrl(`/product/${product.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name.en,
    description: product.description.en || product.tagline.en || product.name.en,
    sku: product.sku,
    ...(product.productCode && { mpn: String(product.productCode) }),
    category: product.categoryName.en,
    url,
    image: product.gallery.map(assetUrl),
    brand: { "@type": "Brand", name: SITE_NAME },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: CURRENCY_CODE,
      price: product.price,
      availability: availabilityOf(product),
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: SITE_NAME },
    },
    // A rating is only emitted once the API reports real reviews.
    ...(product.reviewCount > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: product.rating,
        reviewCount: product.reviewCount,
      },
    }),
  };
}
