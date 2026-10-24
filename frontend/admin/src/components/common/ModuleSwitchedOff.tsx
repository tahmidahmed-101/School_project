import { Link } from "react-router-dom"
import { ArrowRight, PowerOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useCan } from "@/hooks/use-can"
import { useModuleLabel } from "@/hooks/use-modules"

/** Shown instead of a page whose module is switched off in Settings → Modules; it is off for admins too. */
export function ModuleSwitchedOff({ module }: { module: string }) {
  const label = useModuleLabel(module)
  const canManage = useCan("settings.manage")
  return (
    <Card className="items-center px-6 py-14 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground ring-8 ring-muted/20">
        <PowerOff className="size-6 stroke-[1.5]" aria-hidden />
      </div>
      <div>
        <h2 className="text-base font-semibold">{label} is switched off</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {canManage
            ? "Turn it on in Settings → Modules to use this page again."
            : "An administrator can turn it on in Settings → Modules."}
        </p>
      </div>
      {canManage && (
        <Button variant="outline" size="sm" asChild>
          <Link to="/settings?tab=modules">
            <ArrowRight className="size-4" /> Open Modules
          </Link>
        </Button>
      )}
    </Card>
  )
}
