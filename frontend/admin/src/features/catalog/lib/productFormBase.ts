import { z } from "zod"
import { toast } from "sonner"

import { moneySchema } from "@/lib/forms"

import type { Product, ProductPayload } from "../types"
import { OPTION_REFUSALS } from "./options"

/** The basic fields of the product form. */
export const baseShape = {
  name: z.string().trim().min(1, "Name is required"),
  category_id: z.string().min(1, "Choose a category"),
  /** "" means no brand. */
  brand_id: z.string(),
  featured: z.boolean(),
  show_questions: z.boolean(),
  show_price_report: z.boolean(),
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
  show_questions: true,
  show_price_report: true,
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
  show_questions: product.show_questions,
  show_price_report: product.show_price_report,
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
  show_questions: values.show_questions,
  show_price_report: values.show_price_report,
  description: values.description,
  highlights: values.highlights
    .split("\n")
    .map((h) => h.trim())
    .filter(Boolean),
  specs: values.specs.filter((row) => row.name || row.value),
  meta_keywords: values.meta_keywords,
})

/** True (after saying it in plain words) when a failed save was one of the option / variant refusals. */
export function reportedRefusal(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  if (typeof code !== "string" || !OPTION_REFUSALS[code]) return false
  toast.error(OPTION_REFUSALS[code])
  return true
}
