/** Item-count bubble pinned to the corner of a header or tab icon (cart, wishlist). */
export function CountBadge({
  children,
  className = "-right-0.5 -top-0.5",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`shadow-xs absolute flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-bold leading-none text-ink-950 ${className}`}
    >
      {children}
    </span>
  );
}
