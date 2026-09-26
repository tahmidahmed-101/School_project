import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./theme.css";
import { LangProvider } from "./lib/i18n";
import { CatalogProvider } from "./lib/catalog-context";
import { getBrand, getCatalog } from "./lib/site-data";
import { CartProvider } from "./lib/cart";
import { WishlistProvider } from "./lib/wishlist";
import { ClientShell } from "./components/ClientShell";
import { JsonLd } from "./components/JsonLd";
import { AnalyticsScripts } from "./components/AnalyticsScripts";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, organizationJsonLd, socialMetadata, websiteJsonLd } from "./lib/seo";
import { SITE_URL } from "./lib/site-url";

export const viewport: Viewport = {
  themeColor: "#1f4f1d",
  width: "device-width",
  initialScale: 1,
};

const GOOGLE_SITE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
const FB_DOMAIN_VERIFICATION = process.env.NEXT_PUBLIC_FB_DOMAIN_VERIFICATION;

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

const bengaliFont = localFont({
  src: [
    { path: "./fonts/NotoSansBengali-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/NotoSansBengali-600.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  variable: "--font-ts-bengali",
});

// The catalogue and contact details come from the LaunchCart API. Pages are static but re-generated at most every
// minute, so admin changes show up without a rebuild (and a backend outage at build time heals itself).
export const revalidate = 60;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [catalog, brand] = await Promise.all([getCatalog(), getBrand()]);

  return (
    <html lang="en">
      <head>
        <JsonLd data={organizationJsonLd(brand)} />
        <JsonLd data={websiteJsonLd()} />
        <AnalyticsScripts />
      </head>
      <body>
        <div className={`ts-font-scope ${jostFont.variable} ${bengaliFont.variable}`}>
          <CatalogProvider
            products={catalog.products}
            categories={catalog.categories}
            failed={catalog.failed}
            brand={brand}
          >
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
