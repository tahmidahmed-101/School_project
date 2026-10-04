interface NamedUser {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
}

/**
 * The name to show for a user: their first and last name; without one, a readable form of the
 * email's local part ("jane.doe@x.com" -> "Jane Doe"); without either, `fallback`.
 */
export function userDisplayName(user: NamedUser | null | undefined, fallback: string): string {
  if (user?.first_name?.trim() || user?.last_name?.trim()) {
    return [user.first_name, user.last_name].filter(Boolean).join(" ")
  }
  if (user?.email) {
    return user.email
      .split("@")[0]
      .replace(/[._-]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }
  return fallback
}
