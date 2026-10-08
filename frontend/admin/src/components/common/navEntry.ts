import { featureModules } from "@/app/modules"
import type { Kind } from "@/hooks/use-kind"

const navEntries = () =>
  featureModules.flatMap((m) => m.nav).flatMap((section) => section.items.map((item) => ({ section, item })))

const isUnder = (path: string, url: string) => path === url || path.startsWith(`${url}/`)

/** The sidebar entry a page belongs to; a detail or form page maps to the list of its own half by name. */
export function findNavEntry(pathname: string, kind: Kind, backTo?: string) {
  const entries = navEntries()
  const byPrefix = (path: string) =>
    entries
      .filter(({ item }) => item.url !== "/" && isUnder(path, item.url))
      .sort((a, b) => b.item.url.length - a.item.url.length)[0]

  const direct = byPrefix(pathname)
  if (direct) return direct

  const stem = pathname.split("/")[1]?.replace(/_(detail|form)$/, "")
  if (stem) {
    const plurals = [`${stem}s`, stem.replace(/y$/, "ies")]
    const guesses =
      kind === "preorder"
        ? plurals.flatMap((plural) => [`/preorder_${plural}`, `/pre${plural}`])
        : [...plurals.map((plural) => `/${plural}`), `/${stem}`]
    const guessed = entries.find(({ item }) => guesses.includes(item.url))
    if (guessed) return guessed
  }

  return backTo ? byPrefix(backTo.split("?")[0]) : undefined
}
