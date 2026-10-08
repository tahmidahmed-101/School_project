"use client";

import Link from "next/link";
import { AlertTriangle, Compass } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { Button, buttonClass } from "@/design-system/ui/Button";
import { PAGE_TITLE_CLASS } from "@/design-system/ui/PageHeader";

function StatusLayout({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[70vh] w-full flex-col items-center justify-center gap-5 bg-canvas px-4 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-4 border-gold-100">
        {icon}
      </div>
      <div className="space-y-1.5">
        <h1 className={PAGE_TITLE_CLASS}>{title}</h1>
        <p className="max-w-sm text-sm text-fg-muted">{text}</p>
      </div>
      {children}
    </div>
  );
}

export function NotFoundView() {
  const { ui } = useLang();
  return (
    <StatusLayout
      icon={<Compass className="h-7 w-7 text-gold-500" />}
      title={ui("notFoundTitle")}
      text={ui("notFoundText")}
    >
      <Link href="/" className={buttonClass()}>
        {ui("backToHome")}
      </Link>
    </StatusLayout>
  );
}

export function ErrorView({ onRetry }: { onRetry: () => void }) {
  const { ui } = useLang();
  return (
    <StatusLayout
      icon={<AlertTriangle className="h-7 w-7 text-gold-500" />}
      title={ui("errorTitle")}
      text={ui("errorText")}
    >
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onRetry}>
          {ui("tryAgain")}
        </Button>
        <Link href="/" className={buttonClass()}>
          {ui("backToHome")}
        </Link>
      </div>
    </StatusLayout>
  );
}
