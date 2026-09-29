import { apiRequest } from "@/lib/api/client";

/** POST /marketing/subscribe/ — body { email }. 201 on success. */
export const subscribeToNewsletter = (email: string) =>
  apiRequest<Record<string, never>>("/marketing/subscribe/", { method: "POST", body: { email: email.trim() } });
