"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

export default function AnalyticsScripts() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const sync = () => setEnabled(localStorage.getItem("baebe_consent_v1") === "all");
    queueMicrotask(sync);
    window.addEventListener("baebe_consent_changed", sync);
    return () => window.removeEventListener("baebe_consent_changed", sync);
  }, []);

  if (!enabled) return null;

  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  const metaId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const tiktokId = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
  const clarityId = process.env.NEXT_PUBLIC_CLARITY_ID;

  return (
    <>
      {gaId && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
          <Script id="baebe-ga" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${gaId}',{anonymize_ip:true});`}</Script>
        </>
      )}
      {metaId && <Script id="baebe-meta" strategy="lazyOnload">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${metaId}');fbq('track','PageView');`}</Script>}
      {tiktokId && <Script id="baebe-tiktok" strategy="lazyOnload">{`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=['page','track','identify'];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat([].slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e){var n=d.createElement('script');n.async=!0;n.src='https://analytics.tiktok.com/i18n/pixel/events.js?sdkid='+e;var s=d.getElementsByTagName('script')[0];s.parentNode.insertBefore(n,s)};ttq.load('${tiktokId}');ttq.page()}(window,document,'ttq');`}</Script>}
      {clarityId && <Script id="baebe-clarity" strategy="lazyOnload">{`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,'clarity','script','${clarityId}');`}</Script>}
    </>
  );
}
