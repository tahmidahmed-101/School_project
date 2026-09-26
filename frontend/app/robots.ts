import type { MetadataRoute } from "next";
import { SITE_URL } from "./lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/checkout", "/track-order", "/login", "/register", "/api/", "/*?q="] },
    // A sitemap line needs an absolute URL, so it is left out until the site URL is configured.
    ...(SITE_URL ? { sitemap: `${SITE_URL}/sitemap.xml` } : {}),
  };
}
