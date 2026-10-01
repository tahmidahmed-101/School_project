// Mirrors api/v1/admin/audit/serializers.py (kull-mart).

/** AuditLogSerializer — `actor` is the acting user's email (null for system actions). */
export interface AuditLog {
  id: string
  actor: string | null
  action: string
  target_type: string
  target_id: string
  ip_address: string | null
  metadata: Record<string, unknown>
  created_at: string
}

/** LoginHistorySerializer */
export interface LoginHistoryEntry {
  id: string
  email: string
  ip_address: string | null
  was_successful: boolean
  created_at: string
}
