import type { Metadata } from "next";
import StorefrontHome from "@/components/storefront/StorefrontHome";

export const metadata: Metadata = {
  title: "Baebe Boo | Beautiful essentials for little ones",
  description:
    "Shop thoughtfully chosen baby clothing, shoes, feeding, nursery, toys and gifts with nationwide delivery across Ghana.",
};

export default function Home() {
  return <StorefrontHome />;
}
