import "server-only";
import { cookies } from "next/headers";
import { DICT, type UiKey } from "@/lib/dictionary";
import { LANG_COOKIE, toLang } from "@/lib/lang";
import type { Lang, T } from "@/lib/types";

/** The text helpers of `useLang()` for server components, in the language the shopper's cookie names. */
export async function getServerText() {
  const lang: Lang = toLang((await cookies()).get(LANG_COOKIE)?.value) ?? "en";
  return {
    lang,
    t: (value: T | undefined) => (value ? value[lang] || value.en || "" : ""),
    ui: (key: UiKey) => DICT[key][lang] || DICT[key].en,
  };
}
