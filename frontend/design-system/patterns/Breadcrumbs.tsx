"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { useLang } from "@/lib/i18n";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
  showHome?: boolean;
}

export function Breadcrumbs({ items, className = "", showHome = true }: BreadcrumbsProps) {
  const { ui } = useLang();

  return (
    <nav
      aria-label={ui("breadcrumb")}
      className={`flex flex-wrap items-center gap-1.5 text-xs font-medium text-fg-subtle ${className}`}
    >
      <ol className="flex flex-wrap items-center gap-1.5">
        {showHome && (
          <li className="inline-flex items-center">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-fg-subtle transition-colors hover:text-gold-800"
            >
              <Home className="h-3.5 w-3.5 shrink-0" />
              <span>{ui("navHome")}</span>
            </Link>
          </li>
        )}

        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="inline-flex items-center gap-1.5">
              {(showHome || index > 0) && (
                <ChevronRight className="h-3 w-3 shrink-0 text-fg-subtle" aria-hidden="true" />
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="max-w-[140px] truncate text-fg-subtle transition-colors hover:text-gold-800 sm:max-w-xs"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className="max-w-[160px] truncate font-semibold text-fg sm:max-w-sm"
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
