"use client";

import { useState, type FormEvent } from "react";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/modules/auth";
import { Button } from "@/design-system/ui/Button";
import { FormAlert, FormField, inputClass } from "@/design-system/ui/FormField";
import { priceReportPath, toPriceReportInput } from "../../data/product-extras";
import { LoginPrompt, SentNote, customerActionError } from "./customerAction";

interface PriceReportFormProps {
  slug: string;
  productId: string;
  /** The SKU the customer has selected, so staff know which price is meant. */
  variantId?: string;
  /** Price currently shown for that SKU. */
  currentPrice: number;
}

/** Lets a logged-in customer tell the store a price looks wrong. Reports go to staff only; nothing is shown publicly. */
export function PriceReportForm({ slug, productId, variantId, currentPrice }: PriceReportFormProps) {
  const { ui, money } = useLang();
  const { status, authRequest } = useAuth();
  const [expectedPrice, setExpectedPrice] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const result = toPriceReportInput(expectedPrice, comment, variantId);
    if ("error" in result) {
      setError(ui(result.error === "required" ? "priceReportRequired" : "priceReportInvalidPrice"));
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await authRequest(priceReportPath(productId), { method: "POST", body: result.input });
      setExpectedPrice("");
      setComment("");
      setSent(true);
    } catch (err) {
      setError(customerActionError(err, ui, ui("priceReportDuplicate")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 pb-3 pt-3 text-xs leading-relaxed text-fg-muted">
      <p>{ui("priceReportIntro")}</p>

      {status === "authenticated" ? (
        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          {sent && <SentNote>{ui("priceReportSent")}</SentNote>}
          {error && <FormAlert>{error}</FormAlert>}
          <p>
            {ui("priceReportCurrent")}: <strong className="text-fg">{money(currentPrice)}</strong>
          </p>
          <FormField htmlFor="price-report-expected" label={ui("priceReportExpected")}>
            <input
              id="price-report-expected"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={expectedPrice}
              onChange={(e) => {
                setExpectedPrice(e.target.value);
                setSent(false);
              }}
              className={inputClass({ padding: "px-3 py-2", className: "text-xs sm:max-w-[200px]" })}
            />
          </FormField>
          <FormField htmlFor="price-report-comment" label={ui("priceReportComment")}>
            <textarea
              id="price-report-comment"
              rows={3}
              maxLength={1000}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                setSent(false);
              }}
              placeholder={ui("priceReportCommentPlaceholder")}
              className={inputClass({ padding: "px-3 py-2", className: "resize-y text-xs" })}
            />
          </FormField>
          <Button type="submit" size="sm" loading={submitting}>
            {ui("priceReportSubmit")}
          </Button>
        </form>
      ) : (
        status === "guest" && <LoginPrompt slug={slug} label={ui("priceReportLogin")} />
      )}
    </div>
  );
}
