"use client";

import { useCallback, useState, type FormEvent } from "react";
import type { ApiQuestion } from "@/lib/api/types";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/modules/auth";
import { Button } from "@/design-system/ui/Button";
import { FormAlert, inputClass } from "@/design-system/ui/FormField";
import { fetchProductQuestions, questionPath } from "../../data/product-extras";
import { LoginPrompt, SentNote, customerActionError, useCustomerSubmit } from "./customerAction";
import { ListStatus, useShortDate } from "./ListStatus";
import { usePagedList } from "./usePagedList";

const MAX_LENGTH = 1000;

function AskForm({ productId }: { productId: string }) {
  const { ui } = useLang();
  const { authRequest } = useAuth();
  const [question, setQuestion] = useState("");
  const { error, setError, submitting, sent, clearSent, submit } = useCustomerSubmit();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = question.trim();
    if (!text) {
      setError(ui("questionsRequired"));
      return;
    }
    const ok = await submit(
      () => authRequest(questionPath(productId), { method: "POST", body: { question: text } }),
      (err) => customerActionError(err, ui, ui("questionsDuplicate")),
    );
    if (ok) setQuestion("");
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-2">
      {sent && <SentNote>{ui("questionsSent")}</SentNote>}
      {error && <FormAlert>{error}</FormAlert>}
      <label htmlFor="product-question" className="block text-xs font-semibold text-fg">
        {ui("questionsLabel")}
      </label>
      <textarea
        id="product-question"
        rows={3}
        maxLength={MAX_LENGTH}
        value={question}
        onChange={(e) => {
          setQuestion(e.target.value);
          clearSent();
        }}
        placeholder={ui("questionsPlaceholder")}
        className={inputClass({ padding: "px-3 py-2", className: "resize-y text-xs" })}
      />
      <Button type="submit" size="sm" loading={submitting}>
        {ui("questionsSubmit")}
      </Button>
    </form>
  );
}

/** Published questions and answers for a product, plus the form to ask one (customers only). */
export function ProductQuestions({ slug, productId }: { slug: string; productId: string }) {
  const { ui } = useLang();
  const { status } = useAuth();
  const shortDate = useShortDate();
  const fetchPage = useCallback((page: number) => fetchProductQuestions(slug, page), [slug]);
  const { items, loading, failed, hasMore, loadMore, retry } = usePagedList<ApiQuestion>(fetchPage);

  return (
    <div className="space-y-4 pb-3 pt-3 text-xs leading-relaxed text-fg-muted">
      {items.length > 0 && (
        <ul className="divide-y divide-ink-100">
          {items.map((item) => (
            <li key={item.id} className="space-y-1.5 py-3 first:pt-0">
              <p className="flex gap-2 text-sm font-bold text-fg">
                <span className="shrink-0 text-gold-800">{ui("questionsQ")}.</span>
                <span className="whitespace-pre-line">{item.question}</span>
              </p>
              <p className="flex gap-2 text-sm">
                <span className="shrink-0 font-bold text-brand-800">{ui("questionsA")}.</span>
                <span className="whitespace-pre-line">{item.answer}</span>
              </p>
              <p className="text-2xs">
                {item.customer_name} · {shortDate(item.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {!loading && !failed && items.length === 0 && <p>{ui("questionsEmpty")}</p>}

      <ListStatus loading={loading} failed={failed} hasMore={hasMore} onLoadMore={loadMore} onRetry={retry} />

      {status === "authenticated" ? (
        <AskForm productId={productId} />
      ) : (
        // While the saved session is still being restored the prompt would flash for a logged-in customer.
        status === "guest" && <LoginPrompt slug={slug} label={ui("questionsLogin")} />
      )}
    </div>
  );
}
