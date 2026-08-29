import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});
import ConsentBanner from "@/components/analytics/ConsentBanner";
import WebVitals from "@/components/analytics/WebVitals";
import AnalyticsScripts from "@/components/analytics/AnalyticsScripts";
import WishlistSync from "@/components/account/WishlistSync";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://baebeboo.com"),
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
      className={`${jakarta.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <WebVitals />
        <AnalyticsScripts />
        <ConsentBanner />
        <WishlistSync />
      </body>
    </html>
  );
}
