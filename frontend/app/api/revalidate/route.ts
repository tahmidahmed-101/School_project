import { revalidateTag } from "next/cache";
import { CACHE_TAGS, type CacheTag } from "@/lib/cache";
import { serverEnv } from "@/lib/env.server";

const KNOWN_TAGS = new Set<string>(Object.values(CACHE_TAGS));

/**
 * Lets the backend push catalogue and business-profile changes to the storefront immediately instead of waiting
 * for the time-based revalidate. Disabled (404) until REVALIDATE_SECRET is set.
 *
 *   POST /api/revalidate   Authorization: Bearer <REVALIDATE_SECRET>   { "tags": ["catalog"] }
 */
export async function POST(request: Request): Promise<Response> {
  const secret = serverEnv.revalidateSecret;
  if (!secret) return new Response(null, { status: 404 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const requested = (body as { tags?: unknown } | null)?.tags;
  if (!Array.isArray(requested) || requested.length === 0) {
    return Response.json({ error: "tags must be a non-empty array" }, { status: 400 });
  }
  const tags = requested.filter((tag): tag is CacheTag => typeof tag === "string" && KNOWN_TAGS.has(tag));
  if (tags.length !== requested.length) {
    return Response.json({ error: `unknown tag; expected one of ${[...KNOWN_TAGS].join(", ")}` }, { status: 400 });
  }

  for (const tag of tags) revalidateTag(tag, "max");
  return Response.json({ revalidated: tags });
}
