import { getCloudflareContext } from "@opennextjs/cloudflare";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
// Mirrors --color-ink-50 in globals.css; the image service cannot read CSS variables.
const CANVAS_COLOR = "#f6f9f5";
const OG_CACHE_SECONDS = 3600; // CACHE_LIFE.seoFeeds in lib/cache.ts
const PHOTO_TIMEOUT_MS = 8000;

const CACHE_CONTROL = `public, max-age=${OG_CACHE_SECONDS}, s-maxage=${OG_CACHE_SECONDS}`;

interface ImagesBinding {
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: Record<string, unknown>): {
      output(options: { format: string; quality?: number }): Promise<{ response(): Response }>;
    };
  };
}

export function failure(status: number, message: string): Response {
  return new Response(message, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * A 1200x630 share card: the page's own photo, scaled to fit and padded with the site's canvas colour. The Worker's
 * image service reads WebP, which the catalogue photos are. A photo or binding that fails answers an error status
 * with no-store, never a card without the photo, so a crawler retries instead of keeping a blank.
 */
export async function ogCardResponse(photoUrl: string): Promise<Response> {
  const images = getCloudflareContext().env.IMAGES as ImagesBinding | undefined;
  if (!images) return failure(503, "Image service unavailable");

  let photo: Response;
  try {
    photo = await fetch(photoUrl, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
  } catch {
    return failure(502, "Photo unavailable");
  }
  if (!photo.ok || !photo.body || !photo.headers.get("content-type")?.startsWith("image/")) {
    return failure(502, "Photo unavailable");
  }

  try {
    const card = await images
      .input(photo.body)
      .transform({ width: OG_WIDTH, height: OG_HEIGHT, fit: "pad", background: CANVAS_COLOR })
      .output({ format: "image/jpeg", quality: 85 });
    const response = card.response();
    return new Response(response.body, {
      status: 200,
      headers: { "Content-Type": "image/jpeg", "Cache-Control": CACHE_CONTROL },
    });
  } catch (error) {
    console.error("[og-card] transform failed:", error instanceof Error ? error.message : error);
    return failure(502, "Photo could not be rendered");
  }
}
