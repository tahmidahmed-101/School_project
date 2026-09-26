import { apiRequest } from "./client";

/** POST /marketing/subscribe/ — body { email }. 201 on success. */
export const subscribeToNewsletter = (email: string) =>
  apiRequest<Record<string, never>>("/marketing/subscribe/", { method: "POST", body: { email: email.trim() } });

/** POST /marketing/unsubscribe/ — body { email }. Not used by the UI yet. */
export const unsubscribeFromNewsletter = (email: string) =>
  apiRequest<Record<string, never>>("/marketing/unsubscribe/", { method: "POST", body: { email: email.trim() } });
