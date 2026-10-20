// The backend's fixed SMTP failure codes (apps/business/services/email.py `failure_reason`),
// in words staff can act on. Used by the email settings test and by campaign deliveries.
export const SMTP_FAILURE_REASONS: Record<string, string> = {
  auth_failed: "The mail server refused the username or password.",
  connection_failed: "Couldn't connect to the mail server. Check the host and port.",
  timeout: "The mail server didn't answer in time.",
  tls_failed: "The secure connection failed. Check the security setting matches the port.",
  recipient_refused: "The mail server refused the recipient address.",
  sender_refused: "The mail server refused the sender address. Use an address your account may send from.",
  host_not_allowed: "That host points to a private or internal address and can't be used.",
  rejected: "The mail server rejected the message.",
}
