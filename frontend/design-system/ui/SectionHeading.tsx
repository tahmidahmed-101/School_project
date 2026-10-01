import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface SectionHeadingProps {
  title: ReactNode;
  subtitle?: ReactNode;
  viewAllHref?: string;
  viewAllLabel?: ReactNode;
  action?: ReactNode;
  id?: string;
  className?: string;
}

export function SectionHeading({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
  action,
  id,
  className,
}: SectionHeadingProps) {
  const trailing =
    action ??
    (viewAllHref && (
      <Link
        href={viewAllHref}
        className="group inline-flex items-center gap-1 whitespace-nowrap text-xs font-bold text-gold-800 transition-colors hover:text-gold-900 sm:text-sm"
      >
        <span>{viewAllLabel}</span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-1" />
      </Link>
    ));

  return (
    <div className={["flex items-center justify-between gap-3 sm:gap-4", className].filter(Boolean).join(" ")}>
      <div className="min-w-0">
        <h2 id={id} className="ts-display text-xl font-extrabold text-gold-700 sm:text-2xl">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
