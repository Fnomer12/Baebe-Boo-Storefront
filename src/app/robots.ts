import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://baebeboo.com";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/BaebeAdmin", "/BaebeCounter", "/account"] },
    sitemap: `${origin}/sitemap.xml`,
  };
}
