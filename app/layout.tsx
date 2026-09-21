import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./theme.css";
import { LangProvider } from "./lib/i18n";
import { CartProvider } from "./lib/cart";
import { WishlistProvider } from "./lib/wishlist";
import { ClientShell } from "./components/ClientShell";

export const metadata: Metadata = {
  title: "Kull Mart — Women's Fashion, Innerwear, Kids & Gadgets",
  description:
    "Kull Mart, Dhaka — women's fashion, innerwear, kids' items and gadgets. Wholesale & retail with delivery all across Bangladesh.",
  robots: { index: false, follow: false },
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className={`ts-font-scope ${jostFont.variable} ${bengaliFont.variable}`}>
          <LangProvider>
            <CartProvider>
              <WishlistProvider>
                <ClientShell>{children}</ClientShell>
              </WishlistProvider>
            </CartProvider>
          </LangProvider>
        </div>
      </body>
    </html>
  );
}
