import type { HTMLAttributes } from "react";

/** A placeholder block; size and shape come from `className`. */
export function Skeleton({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-ink-100 motion-reduce:animate-none ${className}`}
      {...rest}
    />
  );
}
