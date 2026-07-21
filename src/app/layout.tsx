import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ConsentBanner from "@/components/analytics/ConsentBanner";
import WebVitals from "@/components/analytics/WebVitals";
import AnalyticsScripts from "@/components/analytics/AnalyticsScripts";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://baebe-boo.jtechinnovations.tech"),
  title: {
    default: "Baebe Boo | Everything baby and child",
    template: "%s | Baebe Boo",
  },
  description: "Authentic clothing, shoes, toys, feeding, nursery and gifts for babies and children, with nationwide delivery across Ghana.",
  openGraph: {
    type: "website",
    locale: "en_GH",
    siteName: "Baebe Boo",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <WebVitals />
        <AnalyticsScripts />
        <ConsentBanner />
      </body>
    </html>
  );
}
