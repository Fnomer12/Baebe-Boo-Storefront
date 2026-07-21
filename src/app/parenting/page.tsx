import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Heart } from "lucide-react";
import { PageIntro, StorefrontPage } from "@/components/storefront/StorefrontChrome";
import { parentingArticles } from "@/components/storefront/catalog-data";

export const metadata: Metadata = { title: "Parenting Hub | Baebe Boo", description: "Gentle, practical guides for newborn care, feeding, play and choosing children's essentials." };

export default function ParentingPage() {
  return (
    <StorefrontPage>
      <div className="storefront-shell pb-20 pt-28 sm:pt-32">
        <PageIntro eyebrow="The Parenting Hub" title="A little guidance for all the growing." description="Warm, practical reading for real family days—from first feeds and sleepy nights to busy feet and big imaginations." />
        <section className="storefront-featured-article"><div><span className="storefront-eyebrow"><Heart size={14} /> Start here</span><h2>{parentingArticles[0].title}</h2><p>{parentingArticles[0].excerpt}</p><Link href={`/parenting/${parentingArticles[0].slug}`} className="storefront-primary-button">Read the guide <ArrowRight size={17} /></Link></div><div className="storefront-editorial-art"><BookOpen size={48} /><span>Practical care,<br />gently shared.</span></div></section>
        <div className="storefront-article-grid mt-10">{parentingArticles.map((article, index) => <Link href={`/parenting/${article.slug}`} key={article.slug} data-index={index + 1}><span>{article.category}</span><h3>{article.title}</h3><p>{article.excerpt}</p><small>{article.minutes} min read <ArrowRight size={14} /></small></Link>)}</div>
      </div>
    </StorefrontPage>
  );
}
