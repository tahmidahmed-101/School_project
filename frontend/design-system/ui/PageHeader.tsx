import type { ReactNode } from "react";

export const PAGE_TITLE_CLASS = "ts-display text-2xl font-bold leading-tight text-gold-700 sm:text-3xl lg:text-4xl";

interface PageHeaderProps {
  title: ReactNode;
  breadcrumbs?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, breadcrumbs, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header className={["mb-6 border-b border-ink-200 pb-4 sm:mb-8", className].filter(Boolean).join(" ")}>
      {breadcrumbs}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <h1 className={PAGE_TITLE_CLASS}>{title}</h1>
          {subtitle && <div className="text-sm text-fg-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
