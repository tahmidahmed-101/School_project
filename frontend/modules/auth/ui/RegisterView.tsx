"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useAuth } from "../context";
import { suggestEmailCorrection } from "../domain/email";
import { safeNextPath, splitFullName } from "../domain/redirect";
import { authErrorMessage } from "./authError";
import { Breadcrumbs } from "@/design-system/patterns/Breadcrumbs";
import { Button } from "@/design-system/ui/Button";
import { Container } from "@/design-system/ui/Container";
import { PageHeader } from "@/design-system/ui/PageHeader";
import { FormAlert, FormField, INPUT_CLASS } from "@/design-system/ui/FormField";

export function RegisterView() {
  const { ui } = useLang();
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // A likely misspelling of the email's domain ("gamil.com"). The customer is asked once per address: an account
  // created under a mistyped email cannot be logged into with the right one.
  const [emailFix, setEmailFix] = useState<string | null>(null);
  const [checkedEmail, setCheckedEmail] = useState("");
  // Ids of the password fields currently shown as plain text; each has its own eye toggle.
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !phone.trim() || !password || !confirm) {
      setErrorMsg(ui("registerValidation"));
      return;
    }
    if (password.length < 8) {
      setErrorMsg(ui("registerPasswordShort"));
      return;
    }
    if (password !== confirm) {
      setErrorMsg(ui("registerMismatch"));
      return;
    }
    const typed = email.trim();
    const fix = suggestEmailCorrection(typed);
    if (fix && checkedEmail !== typed) {
      setErrorMsg("");
      setEmailFix(fix);
      setCheckedEmail(typed);
      return;
    }
    setEmailFix(null);
    setErrorMsg("");
    setSubmitting(true);
    try {
      await register({ ...splitFullName(name), email: email.trim(), phone: phone.trim(), password });
      router.push(safeNextPath(new URLSearchParams(window.location.search).get("next")));
    } catch (error) {
      setErrorMsg(authErrorMessage(error, ui));
      setSubmitting(false);
    }
  };

  const fields = [
    { id: "register-name", label: "registerNameLabel", type: "text", auto: "name", value: name, set: setName },
    { id: "register-email", label: "registerEmailLabel", type: "email", auto: "email", value: email, set: setEmail },
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
          className="shadow-xs space-y-4 rounded-2xl border border-ink-200 bg-surface p-5"
        >
          {errorMsg && <FormAlert>{errorMsg}</FormAlert>}
          {emailFix && (
            <div role="alert" className="space-y-2 rounded-xl border border-gold-300 bg-gold-50 p-3 text-xs text-fg">
              <p className="font-semibold">
                {ui("registerEmailSuggestion")} <span className="break-all font-bold">{emailFix}</span>?
              </p>
              <Button
                size="sm"
                onClick={() => {
                  setEmail(emailFix);
                  setEmailFix(null);
                }}
              >
                {ui("registerEmailUse")}
              </Button>
              <p className="text-fg-muted">{ui("registerEmailKeep")}</p>
            </div>
          )}

          {fields.map((f) => (
            <FormField key={f.id} htmlFor={f.id} label={ui(f.label)}>
              {f.type === "password" ? (
                <div className="relative">
                  <input
                    id={f.id}
                    type={revealed[f.id] ? "text" : "password"}
                    autoComplete={f.auto}
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    className={`${INPUT_CLASS} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setRevealed((prev) => ({ ...prev, [f.id]: !prev[f.id] }))}
                    aria-label={revealed[f.id] ? ui("loginHidePassword") : ui("loginShowPassword")}
                    className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-fg-subtle transition-colors hover:text-fg"
                  >
                    {revealed[f.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              ) : (
                <input
                  id={f.id}
                  type={f.type}
                  autoComplete={f.auto}
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  className={INPUT_CLASS}
                />
              )}
            </FormField>
          ))}

          <Button type="submit" size="lg" fullWidth loading={submitting}>
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
