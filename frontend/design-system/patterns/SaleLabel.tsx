const SIZES = {
  sm: "px-1.5 py-0.5 text-2xs",
  md: "px-2 py-0.5 text-2xs sm:text-xs",
} as const;

/** The running sale's name, as staff typed it; sits beside the "N% off" badge. */
export function SaleLabel({ name, size = "sm" }: { name: string; size?: keyof typeof SIZES }) {
  return (
    <span
      title={name}
      className={`max-w-full truncate rounded-md bg-accent font-bold tracking-wide text-accent-fg ${SIZES[size]}`}
    >
      {name}
    </span>
  );
}
