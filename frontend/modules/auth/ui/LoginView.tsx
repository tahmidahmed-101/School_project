"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { Breadcrumbs } from "@/design-system/patterns/Breadcrumbs";
import { Button } from "@/design-system/ui/Button";
import { Container } from "@/design-system/ui/Container";
import { PageHeader } from "@/design-system/ui/PageHeader";
import { FormAlert, FormField, INPUT_CLASS } from "@/design-system/ui/FormField";

export function LoginView() {
  const { ui } = useLang();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setInfoMsg("");
    if (!identifier.trim() || !password) {
      setErrorMsg(ui("loginValidation"));
      return;
    }
    // No auth backend yet: accounts are not available.
    setErrorMsg("");
    setInfoMsg(ui("loginUnavailable"));
  };

  return (
    <div className="min-h-screen bg-white py-8 sm:py-12">
      <Container width="narrow">
        <PageHeader
          breadcrumbs={<Breadcrumbs className="mb-4" items={[{ label: ui("loginTitle") }]} />}
          title={ui("loginTitle")}
          subtitle={ui("loginSubtitle")}
        />

        <form
          onSubmit={handleSubmit}
          noValidate
          className="shadow-xs space-y-4 rounded-2xl border border-ink-200 bg-ink-50 p-5"
        >
          {errorMsg && <FormAlert>{errorMsg}</FormAlert>}
          {infoMsg && (
            <div className="rounded-xl border border-gold-300 bg-gold-50 p-3 text-xs font-semibold text-ink-900">
              {infoMsg}
            </div>
          )}

          <FormField htmlFor="login-identifier" label={ui("loginIdentifierLabel")}>
            <input
              id="login-identifier"
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={ui("loginIdentifierPlaceholder")}
              className={INPUT_CLASS}
            />
          </FormField>

          <FormField htmlFor="login-password" label={ui("loginPasswordLabel")}>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${INPUT_CLASS} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? ui("loginHidePassword") : ui("loginShowPassword")}
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-ink-500 transition-colors hover:text-ink-900"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </FormField>

          <Button type="submit" size="lg" fullWidth>
            {ui("loginSubmit")}
          </Button>

          <p className="text-center text-xs font-semibold text-ink-600">{ui("loginForgot")}</p>
        </form>

        <Link href="/register" className="mt-5 block text-center text-sm font-semibold text-brand-800 hover:underline">
          {ui("loginNoAccount")}
        </Link>
      </Container>
    </div>
  );
}
