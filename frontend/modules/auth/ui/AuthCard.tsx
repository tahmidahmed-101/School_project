import type { FormEventHandler, ReactNode } from "react";
import { Breadcrumbs } from "@/design-system/patterns/Breadcrumbs";
import { Container } from "@/design-system/ui/Container";
import { PageHeader } from "@/design-system/ui/PageHeader";

interface AuthCardProps {
  title: string;
  subtitle: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  /** Shown under the card, e.g. the link to the other screen. */
  footer: ReactNode;
  children: ReactNode;
}

/** Page frame and form card shared by the login and register screens. */
export function AuthCard({ title, subtitle, onSubmit, footer, children }: AuthCardProps) {
  return (
    <div className="min-h-screen bg-white py-8 sm:py-12">
      <Container width="narrow">
        <PageHeader
          breadcrumbs={<Breadcrumbs className="mb-4" items={[{ label: title }]} />}
          title={title}
          subtitle={subtitle}
        />

        <form
          onSubmit={onSubmit}
          noValidate
          className="shadow-xs space-y-4 rounded-2xl border border-ink-200 bg-surface p-5"
        >
          {children}
        </form>

        {footer}
      </Container>
    </div>
  );
}
