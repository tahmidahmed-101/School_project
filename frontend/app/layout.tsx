import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./theme.css";
import { LangProvider } from "@/lib/i18n";
import { CatalogProvider } from "@/modules/catalog";
import { getCatalog } from "@/modules/catalog/server";
import { getBrand } from "@/modules/business/server";
import { CartProvider } from "@/modules/cart";
import { WishlistProvider } from "@/modules/wishlist";
import { ClientShell } from "@/modules/shell";
import { JsonLd } from "@/modules/seo";
import { AnalyticsScripts } from "@/modules/marketing";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  organizationJsonLd,
  socialMetadata,
  websiteJsonLd,
} from "@/modules/seo";
import { publicEnv } from "@/lib/env";
import { THEME_COLOR } from "@/lib/theme-colors";
import { SITE_URL } from "@/lib/site-url";

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  width: "device-width",
  initialScale: 1,
};

const { googleSiteVerification: GOOGLE_SITE_VERIFICATION, fbDomainVerification: FB_DOMAIN_VERIFICATION } = publicEnv;

export const metadata: Metadata = {
  // Resolves every relative canonical / Open Graph URL below; skipped when no site URL is configured.
  ...(SITE_URL ? { metadataBase: new URL(SITE_URL) } : {}),
  applicationName: SITE_NAME,
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  ...socialMetadata({ title: SITE_TITLE, description: SITE_DESCRIPTION }),
  ...((GOOGLE_SITE_VERIFICATION || FB_DOMAIN_VERIFICATION) && {
    verification: {
      ...(GOOGLE_SITE_VERIFICATION ? { google: GOOGLE_SITE_VERIFICATION } : {}),
      ...(FB_DOMAIN_VERIFICATION ? { other: { "facebook-domain-verification": FB_DOMAIN_VERIFICATION } } : {}),
    },
  }),
};

const jostFont = localFont({
  src: "./fonts/Jost-VariableFont.woff2",
  variable: "--font-ts-jost",
  display: "swap",
  weight: "100 900",
});

// Variable font trimmed to the 400-800 weights the UI uses.
const bengaliFont = localFont({
  src: "./fonts/NotoSansBengali-Variable.woff2",
  weight: "400 800",
  display: "swap",
  variable: "--font-ts-bengali",
});

// Categories and contact details come from the LaunchCart API. Pages are static but re-generated at most every
// minute, so admin changes show up without a rebuild (and a backend outage at build time heals itself).
// Only categories and brand go into the shell; pages that list products load them themselves (see ProductsProvider).
export const revalidate = 60; // CACHE_LIFE.catalog in lib/cache.ts

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [catalog, brand] = await Promise.all([getCatalog(), getBrand()]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        <JsonLd data={organizationJsonLd(brand)} />
        <JsonLd data={websiteJsonLd()} />
        <AnalyticsScripts />
      </head>
      <body>
        <div className={`ts-font-scope ${jostFont.variable} ${bengaliFont.variable}`}>
          <CatalogProvider categories={catalog.categories} failed={catalog.failed} brand={brand}>
            <LangProvider>
              <CartProvider>
                <WishlistProvider>
                  <ClientShell>{children}</ClientShell>
                </WishlistProvider>
              </CartProvider>
            </LangProvider>
          </CatalogProvider>
        </div>
      </body>
    </html>
  );
}
