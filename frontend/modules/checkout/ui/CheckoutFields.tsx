"use client";

import { Banknote, CreditCard, HandCoins, Landmark, Receipt, Smartphone, type LucideIcon } from "lucide-react";
import { useLang, type UiKey } from "@/lib/i18n";
import { BD_DISTRICTS } from "../domain/districts";
import type { FormErrors } from "../domain/checkout";
import type { OrderForm } from "@/lib/types";
import type { ApiPaymentMethod } from "@/lib/api/types";
import { Dropdown } from "@/design-system/patterns/Dropdown";
import { FormField, inputClass as fieldClass } from "@/design-system/ui/FormField";
import { cardClass } from "@/design-system/ui/Card";

const PAYMENT_ICON: Record<string, LucideIcon> = {
  cash: Banknote,
  cod: HandCoins,
  card: CreditCard,
  bkash: Smartphone,
  nagad: Smartphone,
  rocket: Smartphone,
  bank_transfer: Landmark,
};

// The API sends English labels; known keys are shown from the dictionary so Bangla mode stays Bangla.
const PAYMENT_LABEL = {
  cod: "checkoutCodLabel",
  cash: "payCash",
  card: "payCard",
  bkash: "payBkash",
  nagad: "payNagad",
  rocket: "payRocket",
  bank_transfer: "payBankTransfer",
  manual: "payManual",
} as const satisfies Record<string, UiKey>;

interface CheckoutFieldsProps {
  form: OrderForm;
  errors: FormErrors;
  onChange: (patch: Partial<OrderForm>) => void;
  paymentMethods: ApiPaymentMethod[];
  paymentMethod: string;
  onPaymentMethodChange: (key: string) => void;
  smsOptIn: boolean;
  onSmsOptInChange: (checked: boolean) => void;
}

export function CheckoutFields({
  form,
  errors,
  onChange,
  paymentMethods,
  paymentMethod,
  onPaymentMethodChange,
  smsOptIn,
  onSmsOptInChange,
}: CheckoutFieldsProps) {
  const { ui } = useLang();
  const inputClass = (field: keyof OrderForm) => fieldClass({ invalid: Boolean(errors[field]) });
  const payTo = paymentMethods.find((m) => m.key === paymentMethod)?.pay_to;

  return (
    <>
      <div className="space-y-6 rounded-3xl border border-ink-200 bg-canvas p-6 shadow-sm sm:p-8">
        <h3 className="border-b border-ink-200 pb-4 text-base font-bold text-fg">{ui("checkoutContactInfo")}</h3>

        <div className="space-y-4">
          <FormField htmlFor="co-name" label={ui("checkoutName")} required error={errors.name}>
            <input
              id="co-name"
              type="text"
              required
              maxLength={150}
              autoComplete="name"
              placeholder={ui("checkoutNamePlaceholder")}
              value={form.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className={inputClass("name")}
            />
          </FormField>

          <FormField htmlFor="co-phone" label={ui("checkoutPhone")} required error={errors.phone}>
            <input
              id="co-phone"
              type="tel"
              required
              maxLength={32}
              autoComplete="tel"
              inputMode="tel"
              placeholder="01XXXXXXXXX"
              value={form.phone}
              onChange={(e) => onChange({ phone: e.target.value })}
              className={inputClass("phone")}
            />
          </FormField>

          <FormField htmlFor="co-district" label={ui("checkoutCity")} required error={errors.district}>
            <Dropdown
              id="co-district"
              invalid={Boolean(errors.district)}
              value={form.district}
              onChange={(district) => onChange({ district })}
              options={BD_DISTRICTS}
              searchable
              placeholder={ui("checkoutDistrictPlaceholder")}
            />
          </FormField>

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
              className={fieldClass({ invalid: Boolean(errors.notes), className: "resize-y" })}
            />
          </FormField>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={smsOptIn}
              onChange={(e) => onSmsOptInChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-gold-500 accent-gold-500 focus:ring-gold-500"
            />
            <span className="min-w-0 text-xs font-semibold text-fg">
              {ui("checkoutSmsOptIn")}
              <span className="mt-0.5 block font-normal text-fg-muted">{ui("checkoutSmsOptInHint")}</span>
            </span>
          </label>
        </div>
      </div>

      <div className={cardClass("canvas", "space-y-3 p-5 shadow-sm")}>
        <h3 className="text-sm font-bold text-fg">{ui("checkoutPaymentMethod")}</h3>
        {/* Compact icon tiles instead of full-width description cards, so N methods don't turn into N*80px of scroll. */}
        <div
          role="radiogroup"
          aria-label={ui("checkoutPaymentMethod")}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
        >
          {paymentMethods.map((method) => {
            const selected = method.key === paymentMethod;
            const Icon = PAYMENT_ICON[method.key] ?? Receipt;
            return (
              <label
                key={method.key}
                className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold-500 ${
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
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                    selected ? "bg-accent text-ink-950" : "bg-brand-50 text-brand-700"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="text-2xs font-bold leading-tight text-fg">
                  {method.key in PAYMENT_LABEL
                    ? ui(PAYMENT_LABEL[method.key as keyof typeof PAYMENT_LABEL])
                    : method.label}
                </span>
              </label>
            );
          })}
        </div>
        {payTo && (
          <p className="text-xs text-fg-muted">
            {ui("checkoutPayTo")}: <span className="font-bold text-fg">{payTo}</span>
          </p>
        )}
      </div>
    </>
  );
}
