"use client";

import { MessageCircle, Phone } from "lucide-react";
import type { PolicyContent } from "../domain/policy-content";
import { useBrand } from "@/modules/catalog";
import { useLang } from "@/lib/i18n";
import { Breadcrumbs } from "@/design-system/patterns/Breadcrumbs";
import { Container } from "@/design-system/ui/Container";
import { PageHeader } from "@/design-system/ui/PageHeader";

interface PolicyViewProps {
  policy: PolicyContent;
}

export function PolicyView({ policy }: PolicyViewProps) {
  const { t, ui } = useLang();
  const BRAND_INFO = useBrand();

  return (
    <div className="min-h-screen bg-canvas py-8 sm:py-12">
      <Container>
        <PageHeader
          breadcrumbs={<Breadcrumbs className="mb-4" items={[{ label: t(policy.title) }]} />}
          title={t(policy.title)}
          subtitle={policy.updated && t(policy.updated)}
        />

        <p className="max-w-3xl text-sm leading-relaxed text-ink-700 sm:text-base lg:max-w-4xl lg:text-lg">
          {t(policy.intro)}
        </p>

        <div className="mt-8 max-w-3xl space-y-7 lg:max-w-4xl">
          {policy.sections.map((section, i) => (
            <div key={i}>
              <h2 className="text-sm font-bold text-ink-950 sm:text-base lg:text-xl">{t(section.heading)}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-fg-muted sm:text-base lg:text-lg">{t(section.body)}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 max-w-3xl rounded-2xl border border-ink-200 bg-surface p-5 sm:p-6 lg:max-w-4xl lg:p-8">
          <h2 className="text-sm font-bold text-ink-950 sm:text-base lg:text-xl">{ui("footerContactUs")}</h2>
          <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-4">
            <a
              href={`https://wa.me/${BRAND_INFO.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-gold-800 transition-colors hover:text-gold-900 sm:text-base lg:text-lg"
            >
              <MessageCircle className="h-4 w-4 shrink-0 lg:h-5 lg:w-5" />
              <span>{ui("heroWhatsapp")}</span>
            </a>
            <a
              href={`tel:${BRAND_INFO.phoneTel}`}
              className="inline-flex items-center gap-2 text-sm font-semibold text-gold-800 transition-colors hover:text-gold-900 sm:text-base lg:text-lg"
            >
              <Phone className="h-4 w-4 shrink-0 lg:h-5 lg:w-5" />
              <span>{BRAND_INFO.phoneInternational}</span>
            </a>
          </div>
        </div>
      </Container>
    </div>
  );
}
