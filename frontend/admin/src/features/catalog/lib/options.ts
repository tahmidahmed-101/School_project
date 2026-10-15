// Product options (Size, Colour, ...) and the combinations they make. Kept free of React and
// "@/" imports so `node --test` can load it (tests/unit/options.test.ts).

export const MAX_OPTIONS = 3

export const cleanOptionText = (text: string) => text.trim().replace(/\s+/g, " ")

export const optionTextKey = (text: string) => cleanOptionText(text).toLowerCase()

/** The spelling already used in the shop for what was typed, so "red" becomes the existing "Red". */
export function adoptKnownSpelling(typed: string, known: readonly string[]): string {
  const key = optionTextKey(typed)
  return known.find((k) => optionTextKey(k) === key) ?? cleanOptionText(typed)
}

export function valueRefusal(existing: readonly string[], typed: string): string | null {
  const value = cleanOptionText(typed)
  if (!value) return "Type a value first."
  const clash = existing.find((e) => optionTextKey(e) === optionTextKey(value))
  return clash ? `"${clash}" is already in this list.` : null
}

/** Every combination of one value per option, in option order (the last option changes fastest). */
export function buildCombinations(options: readonly (readonly string[])[]): string[][] {
  if (options.length === 0 || options.some((values) => values.length === 0)) return []
  return options.reduce<string[][]>(
    (rows, values) => rows.flatMap((row) => values.map((value) => [...row, value])),
    [[]]
  )
}

export const combinationKey = (values: readonly string[]) => values.map(optionTextKey).join("\u0001")

export const combinationTitle = (values: readonly string[]) => values.join(" / ")

export const OPTION_REFUSALS: Record<string, string> = {
  option_limit_reached: "A product can have up to 3 options.",
  option_name_exists: "This product already has an option with that name.",
  option_value_exists: "That value is already in the option.",
  option_needs_value: "Every option needs at least one value.",
  option_default_required: "Choose the value your existing variants get for the new option.",
  option_value_in_use: "A variant still uses that value. Delete the variant first, then remove the value.",
  option_value_has_images: "A photo is set for that value. Remove or move the photo first, then remove the value.",
  option_removal_makes_duplicates:
    "Removing this option would leave two variants that are exactly the same. Delete the extra variants first.",
  variant_options_incomplete: "A variant needs one value for every option of the product.",
  variant_combination_exists: "A variant with this combination already exists.",
  variant_in_use: "This variant is on an order, so its options and SKU cannot be changed.",
  last_variant: "A product needs at least one variant, so the last one cannot be deleted.",
  variant_in_bundle: "This variant is part of a bundle. Take it out of the bundle first, then delete it.",
  bundle_no_options: "A bundle cannot have options.",
  invalid_target: "That value belongs to another product.",
  product_stock_in_use: "This variant still has stock or reservations. Write the stock off first.",
}

export function refusalMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const { code, message } = err as { code?: unknown; message?: unknown }
    if (typeof code === "string" && OPTION_REFUSALS[code]) return OPTION_REFUSALS[code]
    if (typeof message === "string" && message.trim()) return message
  }
  return fallback
}

// One at a time: each variant write locks its product, so a burst of them only queues up on the server.
export async function settleInOrder<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = []
  for (const item of items) {
    try {
      results.push({ status: "fulfilled", value: await run(item) })
    } catch (reason) {
      results.push({ status: "rejected", reason })
    }
  }
  return results
}
