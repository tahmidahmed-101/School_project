/** First letter of the customer's name, or of their email when no name is on the account. */
export function avatarInitial(user: { name: string; email: string }): string {
  const source = user.name.trim() || user.email.trim();
  return (Array.from(source)[0] ?? "?").toUpperCase();
}

/**
 * Profile picture URL the browser may load, or null when there is none. Uploaded pictures live under the API's
 * /media/; they are requested through this site's /media proxy because the CSP only allows same-origin images.
 */
export function avatarSrc(profilePicture: string | undefined | null): string | null {
  const url = profilePicture?.trim();
  if (!url) return null;
  if (url.startsWith("/")) return url.startsWith("//") ? null : url;
  try {
    const parsed = new URL(url);
    return parsed.pathname.startsWith("/media/") ? parsed.pathname : null;
  } catch {
    return null;
  }
}

/** "Jane Mary Doe" -> "Jane", for the small label under the avatar. */
export function firstName(user: { name: string }): string {
  return user.name.trim().split(/\s+/)[0] ?? "";
}
