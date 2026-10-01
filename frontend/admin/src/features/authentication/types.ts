export interface AuthUser {
  id: string
  email: string
  first_name: string
  last_name: string
  role: string
  phone: string
  profile_picture: string
  is_email_verified: boolean
  is_phone_verified?: boolean
  permissions: string[]
}

export interface LoginPayload {
  email: string
  password: string
}

export function hasAdminAccess(user: AuthUser | null): boolean {
  if (!user) return false
  return user.permissions.includes("*") || user.permissions.length > 0
}
