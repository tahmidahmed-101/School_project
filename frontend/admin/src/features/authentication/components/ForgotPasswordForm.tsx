import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, KeyRound, MailIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { TextField } from "@/components/common/form-fields"

import { api, extractApiError, getApiErrorMessage } from "@/lib/api/client"
import { useDocumentTitle } from "@/hooks/use-document-title"

// ForgotPasswordSerializer / ResetPasswordSerializer on the backend (shared with the storefront).
const emailSchema = z.object({
  email: z.string().email("Enter a valid email address"),
})
const resetSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from the email"),
    new_password: z.string().min(8, "At least 8 characters"),
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords don't match",
  })

type EmailValues = z.infer<typeof emailSchema>
type ResetValues = z.infer<typeof resetSchema>

/**
 * Two steps: ask for a reset code by email (POST /customer/auth/forgot-password/), then set a new
 * password with it (POST /customer/auth/reset-password/). The code lasts 10 minutes. The first
 * step answers the same whether or not the email has an account, so it can't be used to probe.
 */
const ForgotPasswordForm = () => {
  useDocumentTitle("Reset password")
  const navigate = useNavigate()
  const [email, setEmail] = useState<string | null>(null)

  const emailForm = useForm<EmailValues>({ resolver: zodResolver(emailSchema), defaultValues: { email: "" } })
  const resetForm = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { code: "", new_password: "", confirm_password: "" },
  })

  const requestCode = async (values: EmailValues) => {
    try {
      await api.post("/customer/auth/forgot-password/", { email: values.email })
      setEmail(values.email)
      toast.success("If that email has an account, a reset code is on its way.")
    } catch (err) {
      toast.error(getApiErrorMessage(extractApiError(err), "Couldn't send the reset code"))
    }
  }

  const resetPassword = async (values: ResetValues) => {
    if (!email) return
    try {
      await api.post("/customer/auth/reset-password/", {
        email,
        code: values.code,
        new_password: values.new_password,
      })
      toast.success("Password changed. Sign in with your new password.")
      navigate("/login", { replace: true })
    } catch (err) {
      toast.error(getApiErrorMessage(extractApiError(err), "Couldn't reset the password"))
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <img src="/brand/logo.png" alt="" width={72} height={72} className="mx-auto size-18 rounded-full" />
          <p className="text-lg font-bold tracking-[0.12em] text-foreground">KULL MART</p>
          <CardTitle className="text-2xl">Reset password</CardTitle>
          <p className="text-sm text-muted-foreground">
            {email
              ? `Enter the 6-digit code sent to ${email} and choose a new password.`
              : "Enter your email and we'll send you a code to reset your password."}
          </p>
        </CardHeader>

        {email ? (
          <form onSubmit={resetForm.handleSubmit(resetPassword)}>
            <CardContent className="flex flex-col gap-4">
              <TextField
                label="Reset code"
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                error={resetForm.formState.errors.code}
                {...resetForm.register("code")}
              />
              <TextField
                label="New password"
                id="new_password"
                type="password"
                autoComplete="new-password"
                error={resetForm.formState.errors.new_password}
                {...resetForm.register("new_password")}
              />
              <TextField
                label="Confirm new password"
                id="confirm_password"
                type="password"
                autoComplete="new-password"
                error={resetForm.formState.errors.confirm_password}
                {...resetForm.register("confirm_password")}
              />
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" variant="apply" className="w-full" disabled={resetForm.formState.isSubmitting}>
                <KeyRound className="h-4 w-4" />
                Set new password
              </Button>
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  resetForm.reset()
                  setEmail(null)
                }}
              >
                Use a different email or send a new code
              </button>
            </CardFooter>
          </form>
        ) : (
          <form onSubmit={emailForm.handleSubmit(requestCode)}>
            <CardContent className="flex flex-col gap-4">
              <TextField
                label="Email"
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                error={emailForm.formState.errors.email}
                {...emailForm.register("email")}
              />
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" variant="apply" className="w-full" disabled={emailForm.formState.isSubmitting}>
                <MailIcon className="h-4 w-4" />
                Send reset code
              </Button>
              <Link
                to="/login"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                <ArrowLeft className="size-3.5" /> Back to sign in
              </Link>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  )
}

export default ForgotPasswordForm
