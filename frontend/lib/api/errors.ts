import { ApiError } from "@/lib/api/client";

/** Translation keys (lib/i18n `ui()`) for the failures the storefront can explain to a shopper. */
export type ApiErrorKey = "errNetwork" | "errNotFound" | "errServer" | "errValidation" | "errRateLimit" | "errGeneric";

/** Maps any thrown value to a UI message key. Backend messages are shown only where they help (see callers). */
export function errorKey(error: unknown): ApiErrorKey {
  if (!(error instanceof ApiError)) return "errGeneric";
  if (error.isNetwork) return "errNetwork";
  if (error.status === 404) return "errNotFound";
  if (error.status === 429) return "errRateLimit";
  if (error.status >= 500) return "errServer";
  if (error.status === 400) return "errValidation";
  return "errGeneric";
}

/** Wrong passwords and validation answers are expected; only crashes and 5xx belong in the error log. */
export function isUnexpectedError(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status >= 500;
}
