import { cn } from "@/lib/utils"
import { displayNameOf, type AdminUser } from "@/features/users/types"

type AvatarUser = Pick<AdminUser, "display_name" | "first_name" | "last_name" | "email" | "profile_picture">

export function UserAvatar({ user, className }: { user: AvatarUser; className?: string }) {
  const name = displayNameOf(user)
  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary",
        className
      )}
    >
      {user.profile_picture ? (
        <img src={user.profile_picture} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </div>
  )
}
