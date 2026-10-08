import { z } from "zod"
import { toast } from "sonner"

import { getApiErrorMessage } from "@/lib/api/client"
import { moneySchema } from "@/lib/forms"

import { createVariant } from "../api"
import type { Product, ProductPayload, ProductVariantPayload } from "../types"
import { uploadStagedImages, type StagedImage } from "./stagedImages"

/** The fields the stock and the pre-order product form both have. */
export const baseShape = {
  name: z.string().trim().min(1, "Name is required"),
  category_id: z.string().min(1, "Choose a category"),
  /** "" means no brand. */
  brand_id: z.string(),
  featured: z.boolean(),
  product_type: z.enum(["simple", "variant"]),
  description: z.string(),
  highlights: z.string(),
  meta_keywords: z.string(),
  price: moneySchema,
  cost_price: moneySchema,
  sku: z.string().trim(),
  is_active: z.boolean(),
  /** Create only: variants queued to be added once the product exists. */
  variants: z.array(
    z.object({ color: z.string().trim(), size: z.string().trim(), sku: z.string().trim(), price: moneySchema })
  ),
}
export type BaseValues = z.infer<z.ZodObject<typeof baseShape>>
export type QueuedVariant = BaseValues["variants"][number]

export const baseDefaults: BaseValues = {
  name: "",
  category_id: "",
  brand_id: "",
  featured: false,
  product_type: "simple",
  description: "",
  highlights: "",
  meta_keywords: "",
  price: "",
  cost_price: "",
  sku: "",
  is_active: true,
  variants: [],
}

export const baseValuesOf = (product: Product): BaseValues => ({
  name: product.name,
  category_id: product.category_id,
  brand_id: product.brand_id ?? "",
  featured: product.featured,
  product_type: product.product_type === "variant" ? "variant" : "simple",
  description: product.description ?? "",
  highlights: (product.highlights ?? []).join("\n"),
  meta_keywords: product.meta_keywords ?? "",
  price: product.price ?? "",
  cost_price: product.cost_price ?? "",
  sku: "",
  is_active: product.is_active,
  variants: [],
})

/** The product fields of the payload; each form adds its own pricing. */
export const basePayload = (values: BaseValues): ProductPayload => ({
  name: values.name,
  category_id: values.category_id,
  brand_id: values.brand_id || null,
  featured: values.featured,
  product_type: values.product_type,
  description: values.description,
  highlights: values.highlights
    .split("\n")
    .map((h) => h.trim())
    .filter(Boolean),
  meta_keywords: values.meta_keywords,
})

export function checkQueuedVariants(v: BaseValues, ctx: z.RefinementCtx) {
  if (v.product_type !== "variant") return
  const seen = new Set<string>()
  v.variants.forEach((row, i) => {
    if (!row.color && !row.size) {
      ctx.addIssue({ code: "custom", path: ["variants", i, "color"], message: "Enter a colour or a size" })
      return
    }
    // The backend rejects a repeated colour + size combination on one product.
    const combo = `${row.color.toLowerCase()}|${row.size.toLowerCase()}`
    if (seen.has(combo)) {
      ctx.addIssue({ code: "custom", path: ["variants", i, "color"], message: "Duplicate colour and size" })
    }
    seen.add(combo)
    if (!row.price && !v.price) {
      ctx.addIssue({ code: "custom", path: ["variants", i, "price"], message: "Set a price here or under Pricing" })
    }
  })
}

/** Adds queued variants and staged images to a just-created product; each failure is toasted, and what failed is returned ("" if nothing). */
export async function addVariantsAndImages(
  productId: string,
  queued: QueuedVariant[],
  toPayload: (row: QueuedVariant) => ProductVariantPayload,
  images: StagedImage[]
) {
  let failedVariants = 0
  for (const row of queued) {
    try {
      await createVariant(productId, toPayload(row))
    } catch (err) {
      failedVariants += 1
      const label = [row.color, row.size].filter(Boolean).join(" / ") || "(default)"
      toast.error(`Variant ${label}: ${getApiErrorMessage(err, "could not be created")}`)
    }
  }
  const failedImages = await uploadStagedImages(productId, images)
  return [
    failedVariants && `${failedVariants} variant${failedVariants === 1 ? "" : "s"}`,
    failedImages && `${failedImages} image${failedImages === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" and ")
}
