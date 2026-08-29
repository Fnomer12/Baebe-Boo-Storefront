import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

import ConsentBanner from "@/components/analytics/ConsentBanner";
import WebVitals from "@/components/analytics/WebVitals";
import AnalyticsScripts from "@/components/analytics/AnalyticsScripts";
import WishlistSync from "@/components/account/WishlistSync";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "https://baebeboo.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),

  applicationName: "Baebe Boo",

  title: {
    default: "Baebe Boo Ghana | Baby & Kids Store",
    template: "%s | Baebe Boo",
  },

  description:
    "Shop authentic baby and children's clothing, shoes, toys, feeding essentials, nursery products and gifts at Baebe Boo Ghana, with nationwide delivery.",

  keywords: [
    "Baebe Boo",
    "Baebe Boo Ghana",
    "BaebeBoo",
    "baby shop Ghana",
    "kids store Ghana",
    "baby clothes Ghana",
    "children clothes Ghana",
    "baby products Ghana",
    "kids products Ghana",
  ],

  authors: [{ name: "Baebe Boo" }],
  creator: "Baebe Boo",
  publisher: "Baebe Boo",

  alternates: {
    canonical: "/",
  },

  openGraph: {
    type: "website",
    url: siteUrl,
    title: "Baebe Boo Ghana | Baby & Kids Store",
    description:
      "Authentic clothing, shoes, toys, feeding essentials, nursery products and gifts for babies and children across Ghana.",
    siteName: "Baebe Boo",
    locale: "en_GH",
  },

  twitter: {
    card: "summary_large_image",
    title: "Baebe Boo Ghana | Baby & Kids Store",
    description:
      "Authentic baby and children's products with nationwide delivery across Ghana.",
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${siteUrl}/#organization`,
  name: "Baebe Boo",
  alternateName: ["BaebeBoo", "Baebe Boo Ghana"],
  url: siteUrl,
  description:
    "Baebe Boo is a baby and children's retail brand offering clothing, shoes, toys, feeding essentials, nursery products and gifts in Ghana.",
  areaServed: {
    "@type": "Country",
    name: "Ghana",
  },
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${siteUrl}/#website`,
  url: siteUrl,
  name: "Baebe Boo",
  alternateName: "Baebe Boo Ghana",
  publisher: {
    "@id": `${siteUrl}/#organization`,
  },
  inLanguage: "en-GH",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-GH"
      data-scroll-behavior="smooth"
      className={`${jakarta.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema),
          }}
        />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteSchema),
          }}
        />
      </head>

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