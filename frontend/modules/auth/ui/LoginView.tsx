"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { Breadcrumbs } from "@/design-system/patterns/Breadcrumbs";

const INPUT_CLASS =
  "w-full rounded-xl border border-ink-300 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition-colors focus:border-gold-500";

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
      <div className="mx-auto max-w-md px-4 sm:px-6">
        <Breadcrumbs className="mb-4" items={[{ label: ui("loginTitle") }]} />

        <div className="mb-6 border-b border-ink-200 pb-4">
          <h1 className="ts-display text-2xl font-bold tracking-tight text-gold-600 sm:text-3xl">{ui("loginTitle")}</h1>
          <p className="mt-1 text-sm text-ink-600">{ui("loginSubtitle")}</p>
        </div>

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

          <div>
            <label htmlFor="login-identifier" className="mb-1.5 block text-xs font-bold text-ink-900">
              {ui("loginIdentifierLabel")}
            </label>
            <input
              id="login-identifier"
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={ui("loginIdentifierPlaceholder")}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-xs font-bold text-ink-900">
              {ui("loginPasswordLabel")}
            </label>
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
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-ink-500 transition-colors hover:text-ink-900"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full cursor-pointer rounded-xl bg-brand-800 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-900"
          >
            {ui("loginSubmit")}
          </button>

          <p className="text-center text-xs font-semibold text-ink-600">{ui("loginForgot")}</p>
        </form>

        <Link href="/register" className="mt-5 block text-center text-sm font-semibold text-brand-800 hover:underline">
          {ui("loginNoAccount")}
        </Link>
      </div>
    </div>
  );
}
