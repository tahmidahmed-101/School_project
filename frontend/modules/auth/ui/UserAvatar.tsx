"use client";

import { useState } from "react";
import type { AuthUser } from "../context";
import { avatarInitial, avatarSrc } from "../domain/avatar";

/** The logged-in customer's profile picture, or their initial on a gold disc when there is none (or it fails to load). */
export function UserAvatar({ user, className = "h-7 w-7 text-xs" }: { user: AuthUser; className?: string }) {
  const src = avatarSrc(user.profilePicture);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent font-extrabold uppercase leading-none text-ink-950 ring-2 ring-gold-300/60 ${className}`}
    >
      {src && failedSrc !== src ? (
        // A plain <img>: avatars are tiny, user-supplied and not worth an image-optimizer round trip.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailedSrc(src)} />
      ) : (
        avatarInitial(user)
      )}
    </span>
  );
}
