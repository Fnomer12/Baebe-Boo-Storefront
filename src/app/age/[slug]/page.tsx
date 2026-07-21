import type { Metadata } from "next";
import CollectionPage from "@/components/storefront/CollectionPage";
import { ageRanges } from "@/components/storefront/catalog-data";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const age = ageRanges.find((item) => item.slug === slug);
  return { title: `${age?.detail || "Shop by age"} | Baebe Boo`, description: `Age-suitable essentials for ${age?.detail || "every stage"}, carefully chosen by Baebe Boo.` };
}

export default async function AgePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const age = ageRanges.find((item) => item.slug === slug);
  return <CollectionPage eyebrow="Made for this moment" title={age ? `${age.name}: ${age.detail}` : "Good things for growing days"} description="Find age-suitable clothing, play, feeding and everyday essentials without the guesswork." filter={(product) => product.ageSlug === slug} />;
}
