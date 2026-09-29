import "server-only";

/**
 * Server-only configuration. Importing this from a client component fails the build, which is the point:
 * anything read here must never reach the browser.
 */

const secret = process.env.REVALIDATE_SECRET?.trim();
if (secret !== undefined && secret !== "" && secret.length < 16) {
  throw new Error("Invalid REVALIDATE_SECRET: use at least 16 characters.");
}

export const serverEnv = {
  /** Shared secret for POST /api/revalidate. Unset disables the endpoint. */
  revalidateSecret: secret || undefined,
} as const;
