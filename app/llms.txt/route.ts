import { buildLlmsTxt } from "../lib/llms";

// The catalogue is static, so this can be generated once at build time instead of per request.
export const dynamic = "force-static";

/** Plain-text catalogue summary for AI crawlers, per the llms.txt convention. */
export function GET(): Response {
  return new Response(buildLlmsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
