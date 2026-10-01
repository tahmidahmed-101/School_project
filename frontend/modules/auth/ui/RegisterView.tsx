"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { Breadcrumbs } from "@/design-system/patterns/Breadcrumbs";
import { Button } from "@/design-system/ui/Button";
import { Container } from "@/design-system/ui/Container";
import { PageHeader } from "@/design-system/ui/PageHeader";

const INPUT_CLASS =
  "w-full rounded-xl border border-ink-300 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition-colors focus:border-gold-500";

export function RegisterView() {
  const { ui } = useLang();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setInfoMsg("");
    if (!name.trim() || !phone.trim() || !password || !confirm) {
      setErrorMsg(ui("registerValidation"));
      return;
    }
    if (password !== confirm) {
      setErrorMsg(ui("registerMismatch"));
      return;
    }
    // No auth backend yet: accounts are not available.
    setErrorMsg("");
    setInfoMsg(ui("loginUnavailable"));
  };

  const fields = [
    { id: "register-name", label: "registerNameLabel", type: "text", auto: "name", value: name, set: setName },
    { id: "register-phone", label: "registerPhoneLabel", type: "tel", auto: "tel", value: phone, set: setPhone },
    {
      id: "register-password",
      label: "loginPasswordLabel",
      type: "password",
      auto: "new-password",
      value: password,
      set: setPassword,
    },
    {
      id: "register-confirm",
      label: "registerConfirmLabel",
      type: "password",
      auto: "new-password",
      value: confirm,
      set: setConfirm,
    },
  ] as const;

  return (
    <div className="min-h-screen bg-white py-8 sm:py-12">
      <Container width="narrow">
        <PageHeader
          breadcrumbs={<Breadcrumbs className="mb-4" items={[{ label: ui("registerTitle") }]} />}
          title={ui("registerTitle")}
          subtitle={ui("registerSubtitle")}
        />

        <form
          onSubmit={handleSubmit}
          noValidate
          className="shadow-xs space-y-4 rounded-2xl border border-ink-200 bg-ink-50 p-5"
        >
          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
              {errorMsg}
            </div>
          )}
          {infoMsg && (
            <div className="rounded-xl border border-gold-300 bg-gold-50 p-3 text-xs font-semibold text-ink-900">
              {infoMsg}
            </div>
          )}

          {fields.map((f) => (
            <div key={f.id}>
              <label htmlFor={f.id} className="mb-1.5 block text-xs font-bold text-ink-900">
                {ui(f.label)}
              </label>
              <input
                id={f.id}
                type={f.type}
                autoComplete={f.auto}
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          ))}

          <Button type="submit" size="lg" fullWidth>
            {ui("registerSubmit")}
          </Button>
        </form>

        <Link href="/login" className="mt-5 block text-center text-sm font-semibold text-brand-800 hover:underline">
          {ui("registerHaveAccount")}
        </Link>
      </Container>
    </div>
  );
}
