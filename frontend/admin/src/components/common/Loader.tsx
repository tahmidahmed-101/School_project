import { Loader2 } from "lucide-react"

/** Full-screen loader (session restore, first page load); sized to the viewport so it centres without a sized parent. */
const Loader = () => {
  return (
    <div role="status" aria-live="polite" className="flex min-h-dvh w-full flex-col items-center justify-center gap-2">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  )
}

export default Loader
