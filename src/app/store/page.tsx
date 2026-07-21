import type { Metadata } from "next";
import StoreCatalog from "@/components/storefront/StoreCatalog";

export const metadata: Metadata = {
  title: "Shop baby & children essentials | Baebe Boo",
  description: "Discover clothing, shoes, feeding, nursery, toys, school essentials and gifts for every stage.",
};

export default async function StorePage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; sort?: string | string[] }> }) {
  const query = await searchParams;
  return <StoreCatalog initialQuery={typeof query.q === "string" ? query.q : ""} initialSort={typeof query.sort === "string" ? query.sort : "featured"} />;
}
