import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://baebe-boo.jtechinnovations.tech";
  return ["", "/store", "/stores", "/parenting", "/about", "/trust", "/track-records"].map((path) => ({
    url: `${origin}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "/store" ? "daily" : "weekly",
    priority: path === "" ? 1 : 0.8,
  }));
}
