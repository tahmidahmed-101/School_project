import { Link } from "react-router-dom"

/** Full-page notice for a screen the signed-in user is not allowed to use. */
export function NoPermission({ message, backTo, backLabel }: { message: string; backTo: string; backLabel: string }) {
  return (
    <div className="section-container py-16 text-center text-sm text-muted-foreground">
      {message}{" "}
      <Link className="text-primary underline" to={backTo}>
        {backLabel}
      </Link>
    </div>
  )
}
