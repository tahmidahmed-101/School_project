import type { Lang } from "@/lib/types";

/** Cookie that carries the shopper's language to the server, so the first HTML is already in that language. */
export const LANG_COOKIE = "kullmart_lang";

export const toLang = (value: string | null | undefined): Lang | null =>
  value === "bn" || value === "en" ? value : null;
