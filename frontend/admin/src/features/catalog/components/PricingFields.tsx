import type { FieldErrors, UseFormRegister } from "react-hook-form"

import { MoneyField } from "@/components/common/form-fields"

interface PricingValues {
  price: string
  discount_price: string
  cost_price: string
}

/** The price, discount price and cost price inputs shared by the product and bundle forms. */
export function PricingFields({
  register,
  errors,
  pricePlaceholder = "0.00",
  costPlaceholder = "0.00",
  costDescription,
}: {
  register: UseFormRegister<PricingValues>
  errors: FieldErrors<PricingValues>
  pricePlaceholder?: string
  costPlaceholder?: string
  costDescription?: string
}) {
  return (
    <>
      <MoneyField
        label="Price"
        showCurrency
        id="price"
        placeholder={pricePlaceholder}
        error={errors.price}
        {...register("price")}
      />
      <MoneyField
        label="Discount price"
        id="discount_price"
        placeholder="Optional"
        error={errors.discount_price}
        {...register("discount_price")}
      />
      <MoneyField
        label="Cost price"
        id="cost_price"
        placeholder={costPlaceholder}
        description={costDescription}
        error={errors.cost_price}
        {...register("cost_price")}
      />
    </>
  )
}
