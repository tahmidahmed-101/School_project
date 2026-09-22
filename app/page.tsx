import type { Metadata } from "next";
import { HomeSections } from "./components/HomeSections";
import { SITE_DESCRIPTION, pageMetadata } from "./lib/seo";

// No title: the layout's default title is used as-is on the home page.
export const metadata: Metadata = pageMetadata({ description: SITE_DESCRIPTION, path: "/" });

export default function KullMartHomePage() {
  return <HomeSections />;
}
