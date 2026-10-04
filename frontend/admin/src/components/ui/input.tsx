import * as React from "react"
import { EyeIcon, EyeOffIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const INPUT_CLASS =
  "h-11 w-full min-w-0 rounded-lg border border-field-border bg-field-bg px-4 py-2.5 text-sm text-field-text transition-all outline-none placeholder:text-field-placeholder focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  // Every password field in the dashboard gets the show/hide toggle from here, so forms only
  // have to say type="password".
  if (type === "password") return <PasswordInput className={className} {...props} />
  return <input type={type} data-slot="input" className={cn(INPUT_CLASS, className)} {...props} />
}

/** A password input with an eye button that shows or hides what was typed. */
function PasswordInput({ className, disabled, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const [shown, setShown] = React.useState(false)
  return (
    <div className="relative w-full">
      <input
        type={shown ? "text" : "password"}
        data-slot="input"
        disabled={disabled}
        className={cn(INPUT_CLASS, "pr-11", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        disabled={disabled}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        {shown ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  )
}

export { Input }
