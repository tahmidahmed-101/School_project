import { publicEnv } from "@/lib/env";

/**
 * Asset URL helper served from the site root (public/).
 */
export function photo(path: string): string {
  const clean = path.replace(/^\/+/, "");
  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    return clean;
  }
  return `/${clean}`;
}

/**
 * Photos come back as `/media/...` or as absolute URLs. Media paths are made absolute on the API origin: the Cloudflare
 * image optimizer reads relative URLs from static assets only, so a proxied `/media/` path would 404 there.
 */
export function normalizeImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.startsWith("/media/")) return trimmed;
  try {
    return `${new URL(publicEnv.apiUrl ?? "").origin}${trimmed}`;
  } catch {
    return trimmed;
  }
}
