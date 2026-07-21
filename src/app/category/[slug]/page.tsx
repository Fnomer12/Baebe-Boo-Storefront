import type { Metadata } from "next";
import CollectionPage from "@/components/storefront/CollectionPage";
import { categories } from "@/components/storefront/catalog-data";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const category = categories.find((item) => item.slug === slug);
  return { title: `${category?.name || "Collection"} | Baebe Boo`, description: `Shop carefully chosen ${category?.name.toLowerCase() || "baby and children essentials"} at Baebe Boo.` };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = categories.find((item) => item.slug === slug);
  const name = category?.name || slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  return <CollectionPage eyebrow="Shop by collection" title={name} description={`Comfort, quality and everyday joy—discover our thoughtfully selected ${name.toLowerCase()} collection.`} filter={(product) => product.categorySlug === slug} />;
}
