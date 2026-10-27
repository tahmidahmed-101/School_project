import openNext from "./.open-next/worker.js";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

const PAGE_SECONDS = 60;
const OG_PATH = /^\/og\/(product|category)\/[^/]+$/;
const PAGE_PATHS = /^\/(shop|pre-order|product\/[^/]+|(shipping|return|refund)-policy)$/;

interface Env {
  CF_VERSION_METADATA?: { id: string };
}

const defaultCache = () => (caches as unknown as { default: Cache }).default;

function pageCacheKey(request: Request, env: Env): Request | null {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  if (url.pathname !== "/" && !PAGE_PATHS.test(url.pathname)) return null;
  const lang = /(?:^|;\s*)kullmart_lang=([^;]*)/.exec(request.headers.get("cookie") ?? "")?.[1] ?? "";
  // The deploy id is in the key: HTML cached before a deploy points at chunks that no longer exist.
  url.searchParams.set("__page", `${env.CF_VERSION_METADATA?.id ?? "dev"}:${lang}`);
  return new Request(url.toString());
}

// A share card costs a photo fetch and a render; the route's own Cache-Control only reaches the browser, so keep it here.
async function cachedOgCard(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cache = defaultCache();
  const { origin, pathname } = new URL(request.url);
  const key = new Request(`${origin}${pathname}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  const response = await openNext.fetch(request, env, ctx);
  if (response.status === 200 && response.headers.get("content-type")?.startsWith("image/")) {
    ctx.waitUntil(cache.put(key, response.clone()));
  }
  return response;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "GET" && OG_PATH.test(new URL(request.url).pathname)) return cachedOgCard(request, env, ctx);
    const key = pageCacheKey(request, env);
    if (!key) return openNext.fetch(request, env, ctx);

    const cache = defaultCache();
    const hit = await cache.match(key);
    if (hit) {
      const fresh = new Response(hit.body, hit);
      fresh.headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
      return fresh;
    }

    const response = await openNext.fetch(request, env, ctx);
    const html = response.status === 200 && response.headers.get("content-type")?.includes("text/html");
    if (html && !response.headers.has("set-cookie")) {
      const stored = new Response(response.clone().body, response);
      stored.headers.set("Cache-Control", `public, max-age=${PAGE_SECONDS}`);
      ctx.waitUntil(cache.put(key, stored));
    }
    return response;
  },
};
