"use client";

import { useLang } from "../lib/i18n";
import { getDeliveryZone } from "../lib/checkout";
import { BD_DISTRICTS } from "../lib/districts";
import type { OrderForm } from "../lib/types";
import { Dropdown } from "./Dropdown";
import { FormField, INPUT_CLASS } from "./ui/FormField";

interface CheckoutFieldsProps {
  form: OrderForm;
  onChange: (patch: Partial<OrderForm>) => void;
}

export function CheckoutFields({ form, onChange }: CheckoutFieldsProps) {
  const { ui } = useLang();

  return (
    <>
      <div className="space-y-6 rounded-3xl border border-ink-200 bg-white p-6 shadow-sm sm:p-8">
        <h3 className="border-b border-ink-200 pb-4 text-base font-bold text-ink-900">
          {ui("checkoutContactInfo")}
        </h3>

        <div className="space-y-4">
          <FormField htmlFor="co-name" label={ui("checkoutFullName")} required>
            <input
              id="co-name"
              type="text"
              required
              placeholder={ui("checkoutFullNamePlaceholder")}
              value={form.fullName}
              onChange={(e) => onChange({ fullName: e.target.value })}
              className={INPUT_CLASS}
            />
          </FormField>

          <FormField htmlFor="co-phone" label={ui("checkoutPhone")} required>
            <input
              id="co-phone"
              type="tel"
              required
              placeholder="01XXXXXXXXX"
              value={form.phoneNumber}
              onChange={(e) => onChange({ phoneNumber: e.target.value })}
              className={INPUT_CLASS}
            />
          </FormField>

          <FormField htmlFor="co-district" label={ui("checkoutCity")} required>
            <Dropdown
              value={form.cityArea}
              onChange={(district) =>
                onChange({ cityArea: district, deliveryZone: getDeliveryZone(district) })
              }
              options={BD_DISTRICTS}
              searchable
              placeholder="Type to search district"
            />
          </FormField>

          <FormField htmlFor="co-addr" label={ui("checkoutAddress")} required>
            <input
              id="co-addr"
              type="text"
              required
              placeholder={ui("checkoutAddressPlaceholder")}
              value={form.deliveryAddress}
              onChange={(e) => onChange({ deliveryAddress: e.target.value })}
              className={INPUT_CLASS}
            />
          </FormField>

          <FormField htmlFor="co-notes" label={ui("checkoutDeliveryNotes")}>
            <textarea
              id="co-notes"
              rows={3}
              placeholder={ui("checkoutDeliveryNotesPlaceholder")}
              value={form.deliveryNotes || ""}
              onChange={(e) => onChange({ deliveryNotes: e.target.value })}
              className={`${INPUT_CLASS} resize-y`}
            />
          </FormField>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-ink-900">{ui("checkoutPaymentMethod")}</h3>
        <div className="rounded-xl border border-gold-500 bg-gold-50/80 p-3.5">
          <span className="block text-xs font-bold text-ink-900">{ui("checkoutCodLabel")}</span>
          <span className="mt-0.5 block text-[11px] text-ink-600">{ui("checkoutCodSub")}</span>
        </div>
      </div>
    </>
  );
}
