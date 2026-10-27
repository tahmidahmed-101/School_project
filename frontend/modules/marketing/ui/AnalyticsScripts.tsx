import Script from "next/script";

import { ga4Bootstrap, metaBootstrap } from "@/lib/analytics";
import { publicEnv } from "@/lib/env";
import { ClickIdCapture } from "./ClickIdCapture";

const { gaId: GA_ID, fbPixelId: FB_PIXEL_ID, tiktokPixelId: TIKTOK_PIXEL_ID } = publicEnv;

/** GA4, Meta Pixel and TikTok Pixel loaders. Each is a no-op until its env var is set. */
export function AnalyticsScripts() {
  return (
    <>
      <ClickIdCapture />
      {GA_ID && (
        <>
          <script dangerouslySetInnerHTML={{ __html: ga4Bootstrap(GA_ID) }} />
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
        </>
      )}

      {FB_PIXEL_ID && (
        <>
          <script dangerouslySetInnerHTML={{ __html: metaBootstrap(FB_PIXEL_ID) }} />
          <Script src="https://connect.facebook.net/en_US/fbevents.js" strategy="afterInteractive" />
        </>
      )}

      {TIKTOK_PIXEL_ID && (
        <Script id="tiktok-pixel-init" strategy="afterInteractive">
          {`!function (w, d, t) {
w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<e.methods.length;n++)ttq.setAndDefer(e,e.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var p=d.createElement("script");p.type="text/javascript",p.async=!0,p.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(p,a)};
ttq.load('${TIKTOK_PIXEL_ID}');
ttq.page();
}(window, document, 'ttq');`}
        </Script>
      )}
    </>
  );
}
