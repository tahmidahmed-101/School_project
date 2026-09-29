"use client";

import { Banknote, CreditCard, HandCoins, Landmark, Receipt, Smartphone, type LucideIcon } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { BD_DISTRICTS } from "../domain/districts";
import type { FormErrors } from "../domain/checkout";
import type { OrderForm } from "@/lib/types";
import type { ApiPaymentMethod } from "@/lib/api/types";
import { Dropdown } from "@/design-system/patterns/Dropdown";
import { FormField, INPUT_CLASS, INPUT_ERROR_CLASS } from "@/design-system/ui/FormField";

/** Icon + accent colour per payment method key, purely decorative (lets a tile grid read at a glance). */
const PAYMENT_STYLE: Record<string, { icon: LucideIcon; accent: string }> = {
  cash: { icon: Banknote, accent: "bg-emerald-50 text-emerald-600" },
  cod: { icon: HandCoins, accent: "bg-amber-50 text-amber-600" },
  card: { icon: CreditCard, accent: "bg-blue-50 text-blue-600" },
  bkash: { icon: Smartphone, accent: "bg-pink-50 text-pink-600" },
  nagad: { icon: Smartphone, accent: "bg-orange-50 text-orange-600" },
  rocket: { icon: Smartphone, accent: "bg-purple-50 text-purple-600" },
  bank_transfer: { icon: Landmark, accent: "bg-sky-50 text-sky-600" },
};
const DEFAULT_PAYMENT_STYLE = { icon: Receipt, accent: "bg-ink-100 text-ink-600" };

interface CheckoutFieldsProps {
  form: OrderForm;
  errors: FormErrors;
  onChange: (patch: Partial<OrderForm>) => void;
  paymentMethods: ApiPaymentMethod[];
  paymentMethod: string;
  onPaymentMethodChange: (key: string) => void;
}

export function CheckoutFields({
  form,
  errors,
  onChange,
  paymentMethods,
  paymentMethod,
  onPaymentMethodChange,
}: CheckoutFieldsProps) {
  const { ui } = useLang();
  const inputClass = (field: keyof OrderForm) => `${INPUT_CLASS} ${errors[field] ? INPUT_ERROR_CLASS : ""}`;

  return (
    <>
      <div className="space-y-6 rounded-3xl border border-ink-200 bg-white p-6 shadow-sm sm:p-8">
        <h3 className="border-b border-ink-200 pb-4 text-base font-bold text-ink-900">{ui("checkoutContactInfo")}</h3>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField htmlFor="co-first-name" label={ui("checkoutFirstName")} required error={errors.firstName}>
              <input
                id="co-first-name"
                type="text"
                required
                maxLength={150}
                autoComplete="given-name"
                placeholder={ui("checkoutFirstNamePlaceholder")}
                value={form.firstName}
                onChange={(e) => onChange({ firstName: e.target.value })}
                className={inputClass("firstName")}
              />
            </FormField>

            <FormField htmlFor="co-last-name" label={ui("checkoutLastName")} error={errors.lastName}>
              <input
                id="co-last-name"
                type="text"
                maxLength={150}
                autoComplete="family-name"
                value={form.lastName}
                onChange={(e) => onChange({ lastName: e.target.value })}
                className={inputClass("lastName")}
              />
            </FormField>
          </div>

          <FormField htmlFor="co-email" label={ui("checkoutEmail")} required error={errors.email}>
            <input
              id="co-email"
              type="email"
              required
              autoComplete="email"
              placeholder="name@example.com"
              value={form.email}
              onChange={(e) => onChange({ email: e.target.value })}
              className={inputClass("email")}
            />
          </FormField>

          <FormField htmlFor="co-phone" label={ui("checkoutPhone")} required error={errors.phone}>
            <input
              id="co-phone"
              type="tel"
              required
              maxLength={32}
              autoComplete="tel"
              placeholder="01XXXXXXXXX"
              value={form.phone}
              onChange={(e) => onChange({ phone: e.target.value })}
              className={inputClass("phone")}
            />
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField htmlFor="co-district" label={ui("checkoutCity")} required error={errors.district}>
              <Dropdown
                value={form.district}
                onChange={(district) => onChange({ district })}
                options={BD_DISTRICTS}
                searchable
                placeholder="Type to search district"
              />
            </FormField>

            <FormField htmlFor="co-postal" label={ui("checkoutPostalCode")} required error={errors.postalCode}>
              <input
                id="co-postal"
                type="text"
                required
                maxLength={32}
                autoComplete="postal-code"
                inputMode="numeric"
                placeholder="1207"
                value={form.postalCode}
                onChange={(e) => onChange({ postalCode: e.target.value })}
                className={inputClass("postalCode")}
              />
            </FormField>
          </div>

          <FormField htmlFor="co-addr" label={ui("checkoutAddress")} required error={errors.address}>
            <input
              id="co-addr"
              type="text"
              required
              maxLength={255}
              autoComplete="street-address"
              placeholder={ui("checkoutAddressPlaceholder")}
              value={form.address}
              onChange={(e) => onChange({ address: e.target.value })}
              className={inputClass("address")}
            />
          </FormField>

          <FormField htmlFor="co-notes" label={ui("checkoutDeliveryNotes")} error={errors.notes}>
            <textarea
              id="co-notes"
              rows={3}
              placeholder={ui("checkoutDeliveryNotesPlaceholder")}
              value={form.notes}
              onChange={(e) => onChange({ notes: e.target.value })}
              className={`${inputClass("notes")} resize-y`}
            />
          </FormField>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-ink-900">{ui("checkoutPaymentMethod")}</h3>
        {/* Compact icon tiles instead of full-width description cards, so N methods don't turn into N*80px of scroll. */}
        <div
          role="radiogroup"
          aria-label={ui("checkoutPaymentMethod")}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
        >
          {paymentMethods.map((method) => {
            const selected = method.key === paymentMethod;
            const isCod = method.key === "cod";
            const { icon: Icon, accent } = PAYMENT_STYLE[method.key] ?? DEFAULT_PAYMENT_STYLE;
            return (
              <label
                key={method.key}
                className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
                  selected
                    ? "border-gold-500 bg-gold-50/80 ring-1 ring-gold-400/40"
                    : "border-ink-200 hover:border-gold-300"
                }`}
              >
                <input
                  type="radio"
                  name="payment_method"
                  value={method.key}
                  checked={selected}
                  onChange={() => onPaymentMethodChange(method.key)}
                  className="sr-only"
                />
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${accent}`}>
                  <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="text-[11px] font-bold leading-tight text-ink-900">
                  {isCod ? ui("checkoutCodLabel") : method.label}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </>
  );
}
