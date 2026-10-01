import { Link } from "react-router-dom"
import { Lock } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

/** Shown instead of report widgets when the user has neither reports.view nor accounting.view. */
export function ReportsUnavailable({ links = [] }: { links?: { to: string; label: string }[] }) {
  return (
    <Card className="items-center px-6 py-14 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground ring-8 ring-muted/20">
        <Lock className="size-6 stroke-[1.5]" aria-hidden />
      </div>
      <div>
        <h2 className="text-base font-semibold">Store metrics aren't available on your account</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Sales, revenue and stock reports need the <span className="font-medium text-foreground">Reports</span>{" "}
          permission. Ask an administrator if you need access.
        </p>
      </div>
      {links.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {links.map((l) => (
            <Button key={l.to} variant="outline" size="sm" asChild>
              <Link to={l.to}>{l.label}</Link>
            </Button>
          ))}
        </div>
      )}
    </Card>
  )
}
