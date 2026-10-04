import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate, useLocation } from "react-router-dom"
import { toast } from "sonner"
import { EyeIcon, EyeOffIcon, LogInIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { FormField, TextField } from "@/components/common/form-fields"

import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { login } from "@/features/authentication/slices/authSlice"
import { getApiErrorMessage } from "@/lib/api/client"
import { useDocumentTitle } from "@/hooks/use-document-title"

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
})

type LoginFormValues = z.infer<typeof loginSchema>

const SignInForm = () => {
  useDocumentTitle("Sign In")

  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const isLoading = useAppSelector((state) => state.auth.isLoading)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  const onSubmit = async (values: LoginFormValues) => {
    try {
      await dispatch(login(values)).unwrap()
      toast.success("Signed in successfully")
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/"
      navigate(from, { replace: true })
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Invalid email or password"))
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm">
        <Card>
          <CardHeader className="items-center text-center">
            <img
              src="/brand/logo.png"
              alt=""
              width={72}
              height={72}
              className="mx-auto size-18 rounded-full"
            />
            <p className="text-lg font-bold tracking-[0.12em] text-foreground">KULL MART</p>
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <p className="text-sm text-muted-foreground">
              Sign in to access the admin dashboard
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <TextField
              label="Email"
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              error={errors.email}
              {...register("email")}
            />

            <FormField label="Password" htmlFor="password" error={errors.password}>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  aria-invalid={errors.password ? true : undefined}
                  className="pr-11"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                </button>
              </div>
            </FormField>
          </CardContent>
          <CardFooter>
            <Button type="submit" variant="apply" className="w-full" disabled={isSubmitting || isLoading}>
              <LogInIcon className="h-4 w-4" />
              Sign in
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}

export default SignInForm
