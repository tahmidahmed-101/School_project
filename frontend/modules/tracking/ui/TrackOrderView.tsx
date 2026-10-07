"use client";

import { useState, type FormEvent } from "react";
import {
  CheckCircle2,
  ClipboardList,
  MapPin,
  MessageSquare,
  Package,
  PackageCheck,
  Phone,
  Search,
  Truck,
  XCircle,
} from "lucide-react";
import { useBrand } from "@/modules/catalog";
import { useLang } from "@/lib/i18n";
import { ApiError } from "@/lib/api/client";
import { trackOrder } from "../data/mutations";
import { errorKey } from "@/lib/api/errors";
import type { ApiTrackOrder, ApiTrackStatus } from "@/lib/api/types";
import { Breadcrumbs } from "@/design-system/patterns/Breadcrumbs";
import { Button, buttonClass } from "@/design-system/ui/Button";
import { Container } from "@/design-system/ui/Container";
import { PageHeader } from "@/design-system/ui/PageHeader";
import { FormAlert, FormField, INPUT_CLASS } from "@/design-system/ui/FormField";

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The backend's progress statuses in order (Cancelled is a separate end state). */
const STAGES = [
  { status: "Placed", labelKey: "trackStagePlaced", icon: ClipboardList },
  { status: "Confirmed", labelKey: "trackStageConfirmed", icon: CheckCircle2 },
  { status: "Packed", labelKey: "trackStagePacked", icon: Package },
  { status: "Shipped", labelKey: "trackStageShipped", icon: Truck },
  { status: "In Transit", labelKey: "trackStageInTransit", icon: Truck },
  { status: "Out for Delivery", labelKey: "trackStageOutForDelivery", icon: MapPin },
  { status: "Delivered", labelKey: "trackStageDelivered", icon: PackageCheck },
] as const satisfies readonly { status: ApiTrackStatus; labelKey: string; icon: unknown }[];

export function TrackOrderView() {
  const { ui, n } = useLang();
  const BRAND_INFO = useBrand();
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ApiTrackOrder | null>(null);

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return `${n(date.getDate())} ${MONTHS_EN[date.getMonth()]} ${n(date.getFullYear())}`;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (!orderNumber.trim() || !phone.trim()) {
      setErrorMsg(ui("trackOrderValidation"));
      setResult(null);
      return;
    }
    setErrorMsg("");
    setIsLoading(true);
    try {
      setResult(await trackOrder(orderNumber, phone));
    } catch (error) {
      setResult(null);
      if (error instanceof ApiError && error.status === 404) {
        // The API answers "not found" for both a wrong order number and a wrong phone, on purpose.
        setErrorMsg(`${ui("trackOrderNotFound")}. ${ui("trackOrderNotFoundHelp")}`);
      } else if (error instanceof ApiError && error.status === 400 && error.message) {
        setErrorMsg(error.message);
      } else {
        setErrorMsg(ui(errorKey(error)));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const whatsappText = result
    ? encodeURIComponent(
        `Hello Kull Mart, I'd like an update on my order #${result.order_number} (Phone: ${phone.trim()}).`,
      )
    : "";

  const currentStageIndex = result ? STAGES.findIndex((stage) => stage.status === result.status) : -1;
  const isCancelled = result?.status === "Cancelled";
  const stageEvent = (status: string) => result?.tracking_timeline.find((event) => event.status === status);

  const breadcrumbs = [{ label: ui("navTrackOrder") }];

  return (
    <div className="min-h-screen bg-white py-8 sm:py-12">
      <Container width="compact">
        <PageHeader breadcrumbs={<Breadcrumbs className="mb-4" items={breadcrumbs} />} title={ui("trackOrderTitle")} />

        <form onSubmit={handleSubmit} className="shadow-xs space-y-4 rounded-2xl border border-ink-200 bg-surface p-5">
          {errorMsg && <FormAlert>{errorMsg}</FormAlert>}

          <FormField htmlFor="track-order-number" label={ui("orderNumberLabel")}>
            <input
              id="track-order-number"
              type="text"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder={ui("trackOrderNumberPlaceholder")}
              className={INPUT_CLASS}
            />
          </FormField>

          <FormField htmlFor="track-order-phone" label={ui("checkoutPhone")}>
            <input
              id="track-order-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01XXX-XXXXXX"
              className={INPUT_CLASS}
            />
          </FormField>

          <Button type="submit" size="lg" fullWidth loading={isLoading} leadingIcon={<Search className="h-4 w-4" />}>
            {ui("trackOrderSubmit")}
          </Button>
        </form>

        {result && (
          <div className="shadow-xs mt-6 space-y-5 rounded-2xl border border-ink-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 pb-4">
              <div>
                <span className="block text-2xs font-semibold text-fg-subtle">{ui("orderNumberLabel")}</span>
                <span className="font-mono text-sm font-bold text-gold-800">{result.order_number}</span>
                <span className="mt-0.5 block text-2xs text-fg-subtle">
                  {ui("trackOrderPlacedOn")}: {formatDate(result.created_at)}
                </span>
              </div>
              <div className="text-right">
                <span className="block text-2xs font-semibold text-fg-subtle">{ui("trackOrderCurrentStatus")}</span>
                <span className={`text-sm font-bold ${isCancelled ? "text-danger" : "text-fg"}`}>
                  {isCancelled ? ui("trackStageCancelled") : ui(STAGES[Math.max(currentStageIndex, 0)]!.labelKey)}
                </span>
              </div>
            </div>

            {isCancelled ? (
              <div className="flex items-center gap-3 rounded-xl border border-danger-line bg-danger-surface p-4 text-sm font-bold text-danger">
                <XCircle className="h-5 w-5 shrink-0" />
                <span>{ui("trackStageCancelled")}</span>
              </div>
            ) : (
              <ol>
                {STAGES.map((stage, index) => {
                  const isComplete = index <= currentStageIndex;
                  const isCurrent = index === currentStageIndex;
                  const isLastStage = index === STAGES.length - 1;
                  const Icon = stage.icon;
                  const event = stageEvent(stage.status);

                  return (
                    <li key={stage.status} className="relative flex gap-3 pb-6 last:pb-0">
                      {!isLastStage && (
                        <span
                          aria-hidden="true"
                          className={`absolute left-[15px] top-8 h-full w-0.5 ${
                            index < currentStageIndex ? "bg-brand-500" : "bg-surface-strong"
                          }`}
                        />
                      )}
                      <span
                        className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                          isComplete
                            ? "border-brand-500 bg-brand-500 text-white"
                            : "border-ink-200 bg-white text-ink-300"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="pt-1">
                        <span className={`block text-sm font-bold ${isComplete ? "text-fg" : "text-fg-subtle"}`}>
                          {ui(stage.labelKey)}
                        </span>
                        {event && (
                          <span className="mt-0.5 block text-2xs text-fg-subtle">
                            {formatDate(event.timestamp)}
                            {event.tracking_number && ` · ${ui("trackOrderTrackingNo")} ${event.tracking_number}`}
                          </span>
                        )}
                        {isCurrent && (
                          <span className="mt-0.5 inline-block rounded-full bg-gold-500/15 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-gold-800">
                            {ui("trackOrderCurrentStatus")}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            <p className="rounded-xl bg-surface p-3 text-2xs leading-relaxed text-fg-subtle">
              {ui("trackOrderDisclaimer")}
            </p>

            <div className="space-y-3 border-t border-ink-200 pt-4">
              <p className="text-xs font-bold text-fg">{ui("trackOrderHelpTitle")}</p>
              <a
                href={`https://wa.me/${BRAND_INFO.whatsapp}?text=${whatsappText}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass({ variant: "secondary", fullWidth: true })}
              >
                <MessageSquare className="h-4 w-4" />
                <span>{ui("orderWhatsappConfirm")}</span>
              </a>
              <a href={`tel:${BRAND_INFO.phoneTel}`} className={buttonClass({ variant: "outline", fullWidth: true })}>
                <Phone className="h-4 w-4 text-gold-500" />
                <span>
                  {ui("orderCallStore")} ({BRAND_INFO.phone})
                </span>
              </a>
            </div>
          </div>
        )}
      </Container>
    </div>
  );
}
