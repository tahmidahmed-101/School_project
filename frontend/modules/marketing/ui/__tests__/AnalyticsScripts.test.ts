import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  publicEnv: { gaId: "G-TEST123", fbPixelId: "1234567890", tiktokPixelId: "" },
}));
vi.mock("next/script", () => ({
  default: (props: { src?: string; strategy?: string }) =>
    createElement("script", { "data-lib": props.src, "data-strategy": props.strategy }),
}));

import { AnalyticsScripts } from "../AnalyticsScripts";

describe("AnalyticsScripts", () => {
  const html = renderToStaticMarkup(createElement(AnalyticsScripts));

  it("renders exactly one inline bootstrap per provider", () => {
    expect(html.match(/<script>/g)).toHaveLength(2);
    expect(html.match(/function gtag\(\)/g)).toHaveLength(1);
    expect(html.match(/fbq\(&#x27;init&#x27;|fbq\('init'/g)).toHaveLength(1);
    expect(html.match(/PageView/g)).toHaveLength(1);
  });

  it("loads both libraries lazily", () => {
    const libs = [...html.matchAll(/<script data-lib="([^"]+)" data-strategy="([^"]+)">/g)];
    expect(libs.map(([, src, strategy]) => [src, strategy])).toEqual([
      ["https://www.googletagmanager.com/gtag/js?id=G-TEST123", "afterInteractive"],
      ["https://connect.facebook.net/en_US/fbevents.js", "afterInteractive"],
    ]);
  });
});
