/**
 * Backend views guarded by `IsAdmin` (users, staff, audit) accept only admins/superusers,
 * whose permission list is ["*"] — no staff permission code unlocks them. Nav items and
 * actions for those endpoints use this code so `hasPermission` only passes for admins.
 */
export const ADMIN_ONLY = "*"
