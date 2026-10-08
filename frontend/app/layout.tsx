import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./theme.css";
import { cookies } from "next/headers";
import { LangProvider } from "@/lib/i18n";
import { LANG_COOKIE, toLang } from "@/lib/lang";
import { CatalogProvider } from "@/modules/catalog";
import { getCatalog } from "@/modules/catalog/server";
import { getBrand } from "@/modules/business/server";
import { AuthProvider } from "@/modules/auth";
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

// Variable font trimmed to the 400-800 weights the UI uses. Not preloaded, and only in the font stack while the
// page is in Bangla (theme.css): an English page must not download this 76 KB file.
const bengaliFont = localFont({
  src: "./fonts/NotoSansBengali-Variable.woff2",
  weight: "400 800",
  display: "swap",
  preload: false,
  variable: "--font-ts-bengali",
});

// The taka sign (U+09F3) alone, cut from the font above with pyftsubset: 1 KB. Every price shows it, and it sits in
// the Bengali Unicode block, so without this an English page fetched the whole Bengali font for one glyph.
const takaFont = localFont({
  src: "./fonts/NotoSansBengali-Taka.woff2",
  weight: "400 800",
  display: "swap",
  variable: "--font-ts-taka",
  declarations: [{ prop: "unicode-range", value: "U+09F3" }],
});

// Categories and contact details come from the LaunchCart API (answers cached per lib/cache.ts).
// Only categories and brand go into the shell; pages that list products load them themselves (see ProductsProvider).
// Without a page cache a timed revalidate only told browsers to keep serving old HTML (stale-while-revalidate);
// after a deploy that HTML asked for chunks that no longer exist. Dynamic pages are sent as no-store.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [catalog, brand, cookieStore] = await Promise.all([getCatalog(), getBrand(), cookies()]);
  const lang = toLang(cookieStore.get(LANG_COOKIE)?.value);

  return (
    <html lang={lang ?? "en"} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        <JsonLd data={organizationJsonLd(brand)} />
        <JsonLd data={websiteJsonLd()} />
        <AnalyticsScripts />
      </head>
      <body>
        <div className={`ts-font-scope ${jostFont.variable} ${bengaliFont.variable} ${takaFont.variable}`}>
          <CatalogProvider categories={catalog.categories} failed={catalog.failed} brand={brand}>
            <LangProvider initialLang={lang}>
              <AuthProvider>
                <CartProvider>
                  <WishlistProvider>
                    <ClientShell>{children}</ClientShell>
                  </WishlistProvider>
                </CartProvider>
              </AuthProvider>
            </LangProvider>
          </CatalogProvider>
        </div>
      </body>
    </html>
  );
}
