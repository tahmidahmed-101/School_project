"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { forgotPassword, resetPassword } from "../data/api";
import { authErrorMessage } from "./authError";
import { Button } from "@/design-system/ui/Button";
import { FormAlert, FormField, INPUT_CLASS } from "@/design-system/ui/FormField";
import { AuthCard } from "./AuthCard";

type Step = "email" | "code" | "done";

export function ForgotPasswordView() {
  const { ui } = useLang();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const sendCode = async () => {
    if (!email.trim()) {
      setErrorMsg(ui("forgotEmailRequired"));
      return;
    }
    setErrorMsg("");
    setSubmitting(true);
    try {
      await forgotPassword(email.trim());
      setCode("");
      setStep("code");
    } catch (error) {
      setErrorMsg(authErrorMessage(error, ui));
    } finally {
      setSubmitting(false);
    }
  };

  const changePassword = async () => {
    if (!code.trim() || !password) {
      setErrorMsg(ui("forgotFieldsRequired"));
      return;
    }
    if (password.length < 8) {
      setErrorMsg(ui("registerPasswordShort"));
      return;
    }
    setErrorMsg("");
    setSubmitting(true);
    try {
      await resetPassword({ email: email.trim(), code: code.trim(), new_password: password });
      setStep("done");
    } catch (error) {
      setErrorMsg(authErrorMessage(error, ui));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (step === "email") void sendCode();
    if (step === "code") void changePassword();
  };

  return (
    <AuthCard
      title={ui("forgotTitle")}
      subtitle={ui("forgotSubtitle")}
      onSubmit={handleSubmit}
      footer={
        <Link href="/login" className="mt-5 block text-center text-sm font-semibold text-brand-800 hover:underline">
          {ui("forgotBackToLogin")}
        </Link>
      }
    >
      {errorMsg && <FormAlert>{errorMsg}</FormAlert>}

      {step === "email" && (
        <>
          <FormField htmlFor="forgot-email" label={ui("loginIdentifierLabel")}>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={ui("loginIdentifierPlaceholder")}
              className={INPUT_CLASS}
            />
          </FormField>
          <Button type="submit" size="lg" fullWidth loading={submitting}>
            {ui("forgotSend")}
          </Button>
        </>
      )}

      {step === "code" && (
        <>
          <p role="status" className="text-sm text-fg-muted">
            {ui("forgotCodeSent")}
          </p>
          <FormField htmlFor="forgot-code" label={ui("forgotCodeLabel")}>
            <input
              id="forgot-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={INPUT_CLASS}
            />
          </FormField>
          <FormField htmlFor="forgot-password" label={ui("forgotNewPasswordLabel")}>
            <div className="relative">
              <input
                id="forgot-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${INPUT_CLASS} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? ui("loginHidePassword") : ui("loginShowPassword")}
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-fg-subtle transition-colors hover:text-fg"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </FormField>
          <Button type="submit" size="lg" fullWidth loading={submitting}>
            {ui("forgotSubmit")}
          </Button>
          <button
            type="button"
            onClick={() => void sendCode()}
            disabled={submitting}
            className="block w-full cursor-pointer text-center text-xs font-semibold text-fg-muted hover:underline"
          >
            {ui("forgotResend")}
          </button>
        </>
      )}

      {step === "done" && (
        <p role="status" className="text-sm font-semibold text-fg">
          {ui("forgotDone")}
        </p>
      )}
    </AuthCard>
  );
}
