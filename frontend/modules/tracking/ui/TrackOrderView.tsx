"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, ClipboardList, MapPin, Package, PackageCheck, Search, Truck, XCircle } from "lucide-react";
import { useAuth } from "@/modules/auth";
import { ContactButtons } from "@/modules/catalog";
import { shortDate } from "@/lib/date";
import { useLang } from "@/lib/i18n";
import { ApiError } from "@/lib/api/client";
import { trackOrder } from "../data/mutations";
import { preorderStageLabel } from "@/lib/preorder-stages";
import { errorKey } from "@/lib/api/errors";
import type { ApiTrackOrder, ApiTrackStatus } from "@/lib/api/types";
import { Breadcrumbs } from "@/design-system/patterns/Breadcrumbs";
import { Loader } from "@/design-system/patterns/Loader";
import { Button } from "@/design-system/ui/Button";
import { Container } from "@/design-system/ui/Container";
import { PageHeader } from "@/design-system/ui/PageHeader";
import { FormAlert, FormField, INPUT_CLASS } from "@/design-system/ui/FormField";
import { cardClass } from "@/design-system/ui/Card";

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

/** `orderId` comes from the account page's "Track order" link: that order is shown without typing anything. */
export function TrackOrderView({ orderId }: { orderId?: string }) {
  const { lang, t, ui, money } = useLang();
  const { status, user, authRequest } = useAuth();
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(Boolean(orderId));
  const [result, setResult] = useState<ApiTrackOrder | null>(null);

  const formatDate = (iso: string) => shortDate(iso, lang);

  // A signed-in customer's own order is looked up by its id; a guest (or a failed lookup) gets the form.
  useEffect(() => {
    if (!orderId || status === "loading") return;
    if (status !== "authenticated") {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    authRequest<ApiTrackOrder>(`/orders/${encodeURIComponent(orderId)}/track/`)
      .then((order) => {
        if (cancelled) return;
        setResult(order);
        setOrderNumber(order.order_number);
        setPhone(user?.phone ?? "");
      })
      .catch((error) => {
        if (!cancelled) setErrorMsg(ui(errorKey(error)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `user` and `ui` are read for the result only; the lookup runs once per order and session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, status, authRequest]);

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
  const isPreorder = result?.order_type === "preorder";
  const currentStatus = !result
    ? ""
    : isCancelled
      ? ui("trackStageCancelled")
      : isPreorder
        ? result.preorder_stage && t(preorderStageLabel(result.preorder_stage))
        : ui(STAGES[Math.max(currentStageIndex, 0)]!.labelKey);
  const stageEvent = (status: string) => result?.tracking_timeline.find((event) => event.status === status);

  const carrierShipments = result?.shipments.filter((shipment) => shipment.carrier_name) ?? [];

  const breadcrumbs = [{ label: ui("navTrackOrder") }];
  // Opened from the account page and not (yet) failed: the order is shown without the form.
  const fromAccount = Boolean(orderId) && !errorMsg && (isLoading || result !== null);

  return (
    <div className="min-h-screen bg-canvas py-8 sm:py-12">
      <Container width="compact">
        <PageHeader breadcrumbs={<Breadcrumbs className="mb-4" items={breadcrumbs} />} title={ui("trackOrderTitle")} />

        {fromAccount && isLoading ? (
          <div role="status" className="flex items-center gap-2 text-xs text-fg-muted">
            <Loader variant="inline" />
            <span>{ui("loading")}</span>
          </div>
        ) : fromAccount ? null : (
          <form onSubmit={handleSubmit} className={cardClass("surface", "shadow-xs space-y-4 p-5")}>
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
        )}

        {result && (
          <div className={cardClass("canvas", "shadow-xs mt-6 space-y-5 p-5")}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 pb-4">
              <div>
                <span className="block text-2xs font-semibold text-fg-subtle">{ui("orderNumberLabel")}</span>
                <span className="font-mono text-sm font-bold text-gold-800">{result.order_number}</span>
                <span className="mt-0.5 block text-2xs text-fg-subtle">
                  {ui("trackOrderPlacedOn")}: {formatDate(result.created_at)}
                </span>
              </div>
              {currentStatus && (
                <div className="text-right">
                  <span className="block text-2xs font-semibold text-fg-subtle">{ui("trackOrderCurrentStatus")}</span>
                  <span className={`text-sm font-bold ${isCancelled ? "text-danger" : "text-fg"}`}>
                    {currentStatus}
                  </span>
                </div>
              )}
            </div>

            {carrierShipments.length > 0 && (
              <ul className="space-y-1 text-2xs text-fg-subtle">
                {carrierShipments.map((shipment) => (
                  <li key={shipment.id}>
                    {ui("trackOrderShipment")}: <span className="font-semibold text-fg">{shipment.carrier_name}</span>
                    {shipment.tracking_number && ` · ${ui("trackOrderTrackingNo")} ${shipment.tracking_number}`}
                  </li>
                ))}
              </ul>
            )}

            {isPreorder && (
              <dl className="grid grid-cols-2 gap-3 rounded-xl bg-surface p-4 text-2xs">
                <div>
                  <dt className="font-semibold text-fg-subtle">{ui("preorderPaid")}</dt>
                  <dd className="mt-0.5 text-sm font-bold text-fg">{money(Number(result.paid_total))}</dd>
                </div>
                <div className="text-right">
                  <dt className="font-semibold text-fg-subtle">{ui("preorderBalanceDue")}</dt>
                  <dd className="mt-0.5 text-sm font-bold text-fg">{money(Number(result.balance_due))}</dd>
                </div>
              </dl>
            )}

            {isPreorder && result.preorder_stage && (
              <section className="rounded-xl bg-surface p-4">
                <h2 className="text-2xs font-semibold text-fg-subtle">{ui("trackPreorderTitle")}</h2>
                <p className="mt-0.5 text-sm font-bold text-gold-800">{t(preorderStageLabel(result.preorder_stage))}</p>
                <ol className="mt-3 space-y-1.5 border-t border-line pt-3">
                  {result.preorder_timeline.map((step) => (
                    <li key={`${step.stage}-${step.at}`} className="flex items-baseline justify-between gap-3 text-2xs">
                      <span className="font-semibold text-fg">{t(preorderStageLabel(step.stage))}</span>
                      <span className="shrink-0 text-fg-subtle">{formatDate(step.at)}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {isCancelled ? (
              <div className="flex items-center gap-3 rounded-xl border border-danger-line bg-danger-surface p-4 text-sm font-bold text-danger">
                <XCircle className="h-5 w-5 shrink-0" />
                <span>{ui("trackStageCancelled")}</span>
              </div>
            ) : isPreorder ? null : (
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
                            : "border-ink-200 bg-canvas text-ink-300"
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
              <ContactButtons whatsappText={whatsappText} />
            </div>
          </div>
        )}
      </Container>
    </div>
  );
}
