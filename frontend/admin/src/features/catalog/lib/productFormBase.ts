import { z } from "zod"
import { toast } from "sonner"

import { moneySchema } from "@/lib/forms"

import type { Product, ProductPayload } from "../types"
import { OPTION_REFUSALS, optionTextKey } from "./options"

/** The fields the stock and the pre-order product form both have. */
export const baseShape = {
  name: z.string().trim().min(1, "Name is required"),
  category_id: z.string().min(1, "Choose a category"),
  /** "" means no brand. */
  brand_id: z.string(),
  featured: z.boolean(),
  description: z.string(),
  highlights: z.string(),
  meta_keywords: z.string(),
  price: moneySchema,
  cost_price: moneySchema,
  sku: z.string().trim(),
  is_active: z.boolean(),
  specs: z.array(z.object({ name: z.string().trim(), value: z.string().trim() })),
}
export type BaseValues = z.infer<z.ZodObject<typeof baseShape>>

export const baseDefaults: BaseValues = {
  name: "",
  category_id: "",
  brand_id: "",
  featured: false,
  description: "",
  highlights: "",
  meta_keywords: "",
  price: "",
  cost_price: "",
  sku: "",
  is_active: true,
  specs: [],
}

export const baseValuesOf = (product: Product): BaseValues => ({
  name: product.name,
  category_id: product.category_id,
  brand_id: product.brand_id ?? "",
  featured: product.featured,
  description: product.description ?? "",
  highlights: (product.highlights ?? []).join("\n"),
  meta_keywords: product.meta_keywords ?? "",
  price: product.price ?? "",
  cost_price: product.cost_price ?? "",
  sku: "",
  is_active: product.is_active,
  specs: Array.isArray(product.specs) ? product.specs.map(({ name, value }) => ({ name, value })) : [],
})

/** The product fields of the payload; each form adds its own pricing. */
export const basePayload = (values: BaseValues): ProductPayload => ({
  name: values.name,
  category_id: values.category_id,
  brand_id: values.brand_id || null,
  featured: values.featured,
  description: values.description,
  highlights: values.highlights
    .split("\n")
    .map((h) => h.trim())
    .filter(Boolean),
  specs: values.specs.filter((row) => row.name || row.value),
  meta_keywords: values.meta_keywords,
})

/** A half-filled or repeated specification row is refused; a fully blank row is dropped on save. */
export function checkSpecs(v: Pick<BaseValues, "specs">, ctx: z.RefinementCtx) {
  const seen = new Set<string>()
  v.specs.forEach((row, i) => {
    if (!row.name && !row.value) return
    if (!row.name) ctx.addIssue({ code: "custom", path: ["specs", i, "name"], message: "Name this row" })
    if (!row.value) ctx.addIssue({ code: "custom", path: ["specs", i, "value"], message: "Enter a value" })
    const key = optionTextKey(row.name)
    if (key && seen.has(key)) {
      ctx.addIssue({ code: "custom", path: ["specs", i, "name"], message: "This name is already in the list" })
    }
    seen.add(key)
  })
}

/** True (after saying it in plain words) when a failed save was one of the option / variant refusals. */
export function reportedRefusal(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  if (typeof code !== "string" || !OPTION_REFUSALS[code]) return false
  toast.error(OPTION_REFUSALS[code])
  return true
}
