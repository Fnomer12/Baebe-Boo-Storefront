"use client";

import { useReportWebVitals } from "next/web-vitals";

export default function WebVitals() {
  useReportWebVitals((metric) => {
    const body = JSON.stringify({
      id: metric.id,
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      path: window.location.pathname,
    });
    navigator.sendBeacon?.("/api/analytics/vitals", body);
  });

  return null;
}
