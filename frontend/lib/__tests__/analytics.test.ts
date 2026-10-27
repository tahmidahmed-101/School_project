import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeProduct } from "@/tests/fixtures";
import {
  ga4Bootstrap,
  gaClientId,
  metaBootstrap,
  purchaseEventId,
  readTrackingContext,
  trackAddToCart,
  trackPurchase,
  trackViewContent,
} from "../analytics";

function stubBrowser(cookies: string, search = "") {
  const store = new Map<string, string>();
  const gtag = vi.fn();
  const fbq = vi.fn();
  const track = vi.fn();
  vi.stubGlobal("document", { cookie: cookies });
  vi.stubGlobal("window", {
    location: { search, href: `https://shop.example/checkout${search}` },
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
    gtag,
    fbq,
    ttq: { track },
  });
  return { gtag, fbq, track };
}

afterEach(() => vi.unstubAllGlobals());

describe("gaClientId", () => {
  it("keeps the last two segments of the _ga cookie", () => {
    expect(gaClientId("GA1.1.111.222")).toBe("111.222");
    expect(gaClientId("")).toBe("");
  });
});

describe("readTrackingContext", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-10-25T10:00:00Z")));
  afterEach(() => vi.useRealTimers());

  it("reads the pixel cookies and leaves out what is missing", () => {
    stubBrowser("_fbp=fb.1.1.2; _ga=GA1.1.111.222; other=x");
    expect(readTrackingContext()).toEqual({
      fbp: "fb.1.1.2",
      ga_client_id: "111.222",
      source_url: "https://shop.example/checkout",
    });
  });

  it("builds fbc and ttclid from the landing URL's click ids", () => {
    stubBrowser("", "?fbclid=abc&ttclid=xyz");
    expect(readTrackingContext()).toMatchObject({
      fbc: `fb.1.${Date.now()}.abc`,
      ttclid: "xyz",
    });
  });
});

describe("pixel events", () => {
  it("send the catalogue product id to every pixel", () => {
    const { gtag, fbq, track } = stubBrowser("");
    const product = makeProduct({ id: "prod-1", price: 500 });

    trackViewContent(product);

    expect(gtag.mock.calls[0]![2].items[0].item_id).toBe("prod-1");
    expect(fbq.mock.calls[0]![2].content_ids).toEqual(["prod-1"]);
    expect(track.mock.calls[0]![1].contents[0].content_id).toBe("prod-1");
  });

  it("add to cart values the quantity", () => {
    const { gtag } = stubBrowser("");
    trackAddToCart(makeProduct({ id: "prod-1", price: 500 }), 3);
    expect(gtag.mock.calls[0]![2]).toMatchObject({ currency: "BDT", value: 1500 });
  });
});

describe("trackPurchase", () => {
  const order = { id: "order-1", orderNumber: "SO-1", total: 1100, items: [] };

  it("shares one event id with the server and counts an order once", () => {
    const { gtag, fbq, track } = stubBrowser("");

    trackPurchase(order);
    trackPurchase(order);

    expect(fbq).toHaveBeenCalledTimes(1);
    expect(fbq.mock.calls[0]![3]).toEqual({ eventID: purchaseEventId("order-1") });
    expect(track.mock.calls[0]![2]).toEqual({ event_id: "purchase-order-1" });
    expect(gtag.mock.calls[0]![2]).toMatchObject({ transaction_id: "SO-1", value: 1100 });
  });
});

describe("pixel bootstrap", () => {
  it("queues an event fired before the lazy library scripts load", () => {
    const win: Record<string, unknown> & { dataLayer?: ArrayLike<unknown>[]; fbq?: { queue: ArrayLike<unknown>[] } } = {};
    win.window = win;
    vm.runInNewContext(`${ga4Bootstrap("G-TEST")}${metaBootstrap("123")}`, win);
    vi.stubGlobal("window", { ...win, sessionStorage: { getItem: () => null, setItem: () => {} } });

    trackViewContent(makeProduct({ id: "prod-1", price: 500 }));

    const gtagCalls = win.dataLayer!.map((args) => Array.from(args));
    expect(gtagCalls.map((call) => call[0])).toEqual(["js", "config", "event"]);
    expect(gtagCalls[2][1]).toBe("view_item");
    const fbqCalls = win.fbq!.queue.map((args) => Array.from(args));
    expect(fbqCalls.map((call) => call.slice(0, 2))).toEqual([
      ["init", "123"],
      ["track", "PageView"],
      ["track", "ViewContent"],
    ]);
  });

  it("sends one PageView and never re-initialises the pixel", () => {
    expect(metaBootstrap("123").match(/'PageView'/g)).toHaveLength(1);
    expect(metaBootstrap("123").match(/fbq\('init'/g)).toHaveLength(1);
  });
});
