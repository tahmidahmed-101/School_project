import type { CartItem, Product } from "@/lib/types";

const CURRENCY = "BDT";
const CLICK_IDS_KEY = "kullmart:click-ids";
const PURCHASE_SENT_KEY = "kullmart:purchase-sent";

type Gtag = (command: "event", name: string, params: Record<string, unknown>) => void;
type Fbq = (command: "track", name: string, params: Record<string, unknown>, options: { eventID: string }) => void;
type Ttq = { track: (name: string, params: Record<string, unknown>, options: { event_id: string }) => void };

declare global {
  interface Window {
    gtag?: Gtag;
    fbq?: Fbq;
    ttq?: Ttq;
  }
}

export interface TrackingContext {
  fbp?: string;
  fbc?: string;
  ga_client_id?: string;
  ttp?: string;
  ttclid?: string;
  source_url?: string;
}

interface Line {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

const readStorage = (key: string): string => {
  try {
    return window.sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};

const writeStorage = (key: string, value: string) => {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* private mode: the id is simply not remembered */
  }
};

const cookie = (name: string): string => {
  const hit = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : "";
};

/** Remembers the ad click ids of the landing URL: checkout is usually a later page. */
export function captureClickIds(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const fbclid = params.get("fbclid");
  const ttclid = params.get("ttclid");
  if (!fbclid && !ttclid) return;
  const saved = readStorage(CLICK_IDS_KEY);
  const previous = saved ? (JSON.parse(saved) as { fbc?: string; ttclid?: string }) : {};
  writeStorage(
    CLICK_IDS_KEY,
    JSON.stringify({
      fbc: fbclid ? `fb.1.${Date.now()}.${fbclid}` : previous.fbc,
      ttclid: ttclid ?? previous.ttclid,
    }),
  );
}

/** `GA1.1.123.456` -> `123.456`, the client id GA4 expects. */
export const gaClientId = (gaCookie: string): string => gaCookie.split(".").slice(2).join(".");

/** What checkout sends so the server-side Purchase can be matched to this browser. Empty fields are left out. */
export function readTrackingContext(): TrackingContext {
  if (typeof window === "undefined") return {};
  captureClickIds();
  const saved = readStorage(CLICK_IDS_KEY);
  const clickIds = saved ? (JSON.parse(saved) as { fbc?: string; ttclid?: string }) : {};
  const context: TrackingContext = {
    fbp: cookie("_fbp"),
    fbc: cookie("_fbc") || clickIds.fbc,
    ga_client_id: gaClientId(cookie("_ga")),
    ttp: cookie("_ttp"),
    ttclid: clickIds.ttclid,
    source_url: window.location.href,
  };
  return Object.fromEntries(Object.entries(context).filter(([, value]) => value)) as TrackingContext;
}

const productLine = (product: Product, quantity: number): Line => ({
  id: product.id,
  name: product.name.en,
  price: product.price,
  quantity,
});

const cartLines = (items: CartItem[]): Line[] => items.map((item) => productLine(item.product, item.quantity));

const total = (lines: Line[]) => lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

interface Event {
  ga: string;
  meta: string;
  tiktok: string;
}

const EVENTS = {
  view: { ga: "view_item", meta: "ViewContent", tiktok: "ViewContent" },
  add: { ga: "add_to_cart", meta: "AddToCart", tiktok: "AddToCart" },
  checkout: { ga: "begin_checkout", meta: "InitiateCheckout", tiktok: "InitiateCheckout" },
  purchase: { ga: "purchase", meta: "Purchase", tiktok: "CompletePayment" },
} satisfies Record<string, Event>;

function send(event: Event, lines: Line[], eventId: string, extra: { value?: number; transactionId?: string } = {}): void {
  if (typeof window === "undefined") return;
  const value = extra.value ?? total(lines);
  const transactionId = extra.transactionId;
  window.gtag?.("event", event.ga, {
    currency: CURRENCY,
    value,
    ...(transactionId && { transaction_id: transactionId }),
    items: lines.map((line) => ({
      item_id: line.id,
      item_name: line.name,
      price: line.price,
      quantity: line.quantity,
    })),
  });
  window.fbq?.(
    "track",
    event.meta,
    {
      currency: CURRENCY,
      value,
      content_type: "product",
      content_ids: lines.map((line) => line.id),
      contents: lines.map((line) => ({ id: line.id, quantity: line.quantity, item_price: line.price })),
      num_items: lines.reduce((sum, line) => sum + line.quantity, 0),
    },
    { eventID: eventId },
  );
  window.ttq?.track(
    event.tiktok,
    {
      currency: CURRENCY,
      value,
      content_type: "product",
      contents: lines.map((line) => ({
        content_id: line.id,
        content_name: line.name,
        quantity: line.quantity,
        price: line.price,
      })),
    },
    { event_id: eventId },
  );
}

const eventId = (name: string) => `${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const trackViewContent = (product: Product) => send(EVENTS.view, [productLine(product, 1)], eventId("view"));

export const trackAddToCart = (product: Product, quantity: number) =>
  send(EVENTS.add, [productLine(product, quantity)], eventId("add"));

export const trackInitiateCheckout = (items: CartItem[]) => send(EVENTS.checkout, cartLines(items), eventId("checkout"));

/** The id the backend reports for the same order, so the pixel's Purchase and the server's collapse into one. */
export const purchaseEventId = (orderId: string) => `purchase-${orderId}`;

/** Once per order per browser session: a reload of the success page must not count the sale again. `total` is the order's grand total as the backend charged it. */
export function trackPurchase(order: { id: string; orderNumber: string; total: number; items: CartItem[] }): void {
  if (typeof window === "undefined" || !order.id) return;
  const sent = readStorage(PURCHASE_SENT_KEY).split(",");
  if (sent.includes(order.id)) return;
  writeStorage(PURCHASE_SENT_KEY, [...sent, order.id].join(","));
  send(EVENTS.purchase, cartLines(order.items), purchaseEventId(order.id), {
    value: order.total,
    transactionId: order.orderNumber,
  });
}
