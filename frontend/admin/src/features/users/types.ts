// Mirrors api/v1/admin/users/serializers.py and api/v1/admin/staff/serializers.py (kull-mart).

export type UserRole = "admin" | "staff" | "customer"

/** AdminUserSerializer — shared by /admin/users/ and /admin/staff/. */
export interface AdminUser {
  id: string
  email: string
  first_name: string
  last_name: string
  display_name: string
  role: UserRole
  phone: string
  contact_phone: string
  profile_picture: string
  is_active: boolean
  is_email_verified: boolean
  is_phone_verified: boolean
  is_superuser: boolean
  date_joined: string
  last_login: string | null
  permissions: string[]
  deleted_at: string | null
  /** Only on GET /admin/users/{id}/ (customer_order_summary). */
  order_summary?: OrderSummary
}

export interface OrderSummary {
  total_orders: number
  completed_orders: number
  cancelled_orders: number
  pending_orders: number
  total_spent: string
}

/** AdminAddressSerializer — GET /admin/users/{id}/addresses/ */
export interface AdminAddress {
  id: string
  address_type: "shipping" | "billing" | "other"
  full_name: string
  phone: string
  line1: string
  line2: string
  delivery_note: string
  city: string
  state: string
  postal_code: string
  country: string
  is_default: boolean
}

/** One entry of GET /admin/staff/permission-codes/ */
export interface PermissionCodeInfo {
  id: string
  code: string
  label: string
  domain: string
  domain_label: string
}

/** StaffCreateSerializer */
export interface StaffCreatePayload {
  email: string
  password: string
  first_name?: string
  last_name?: string
  phone?: string
  profile_picture?: string
  permissions?: string[]
}

/** StaffUpdateSerializer */
export interface StaffUpdatePayload {
  first_name?: string
  last_name?: string
  phone?: string
  profile_picture?: string
  is_active?: boolean
}

/** The subset of AdminSalesOrderSerializer the customer page shows (GET /admin/orders/?customer_id=). */
export interface CustomerOrderRow {
  id: string
  order_number: string
  status: string
  grand_total: string
  created_at: string
}

export const displayNameOf = (user: Pick<AdminUser, "display_name" | "first_name" | "last_name" | "email">) =>
  user.display_name || [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email
