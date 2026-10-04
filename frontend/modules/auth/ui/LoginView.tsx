"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useAuth } from "../context";
import { safeNextPath } from "../domain/redirect";
import { authErrorMessage } from "./authError";
import { AccountView } from "./AccountView";
import { Breadcrumbs } from "@/design-system/patterns/Breadcrumbs";
import { Button } from "@/design-system/ui/Button";
import { Container } from "@/design-system/ui/Container";
import { PageHeader } from "@/design-system/ui/PageHeader";
import { FormAlert, FormField, INPUT_CLASS } from "@/design-system/ui/FormField";

export function LoginView() {
  const { ui } = useLang();
  const router = useRouter();
  const { status, user, login, logout } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setErrorMsg(ui("loginValidation"));
      return;
    }
    setErrorMsg("");
    setSubmitting(true);
    try {
      await login(identifier.trim(), password);
      // Read at submit time rather than with useSearchParams, which would force this static page to suspend.
      router.push(safeNextPath(new URLSearchParams(window.location.search).get("next")));
    } catch (error) {
      setErrorMsg(authErrorMessage(error, ui));
      setSubmitting(false);
    }
  };

  // Already logged in (and not mid-redirect after a fresh login): this page doubles as the account summary.
  if (status === "authenticated" && user && !submitting) {
    return <AccountView user={user} onLogout={() => void logout()} />;
  }

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
          className="shadow-xs space-y-4 rounded-2xl border border-ink-200 bg-surface p-5"
        >
          {errorMsg && <FormAlert>{errorMsg}</FormAlert>}

          <FormField htmlFor="login-identifier" label={ui("loginIdentifierLabel")}>
            <input
              id="login-identifier"
              type="email"
              autoComplete="email"
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
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-fg-subtle transition-colors hover:text-fg"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </FormField>

          <Button type="submit" size="lg" fullWidth loading={submitting}>
            {ui("loginSubmit")}
          </Button>

          <p className="text-center text-xs font-semibold text-fg-muted">{ui("loginForgot")}</p>
        </form>

        <Link href="/register" className="mt-5 block text-center text-sm font-semibold text-brand-800 hover:underline">
          {ui("loginNoAccount")}
        </Link>
      </Container>
    </div>
  );
}
