/**
 * Cloudflare's per-location cache, used to keep cacheable API answers on the Worker between requests. The site has
 * no page cache, so without this every page view goes back to the API for the catalogue. Outside a Worker (dev,
 * build, tests) there is no such cache and both functions do nothing.
 */
interface EdgeCache {
  match(key: string): Promise<Response | undefined>;
  put(key: string, value: Response): Promise<void>;
}

function edgeCache(): EdgeCache | null {
  return (globalThis as { caches?: { default?: EdgeCache } }).caches?.default ?? null;
}

export async function readEdgeCache(url: string): Promise<Response | null> {
  try {
    return (await edgeCache()?.match(url)) ?? null;
  } catch (error) {
    console.warn("[edge-cache] read failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function writeEdgeCache(url: string, body: string, seconds: number): Promise<void> {
  if (seconds <= 0) return;
  try {
    await edgeCache()?.put(
      url,
      new Response(body, {
        headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${seconds}` },
      }),
    );
  } catch (error) {
    console.warn("[edge-cache] write failed:", error instanceof Error ? error.message : error);
  }
}
