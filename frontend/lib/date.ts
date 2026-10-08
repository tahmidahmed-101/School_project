import type { Lang } from "@/lib/types";

/** "12 Mar 2026" / "১২ মার্চ, ২০২৬" from an API date or timestamp, in Bangladesh time; "" when missing or invalid. */
export function shortDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  }).format(date);
}
