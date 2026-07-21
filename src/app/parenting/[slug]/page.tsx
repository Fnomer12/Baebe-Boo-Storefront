import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen, Check } from "lucide-react";
import { StorefrontPage } from "@/components/storefront/StorefrontChrome";
import { parentingArticles } from "@/components/storefront/catalog-data";

function getArticle(slug: string) { return parentingArticles.find((article) => article.slug === slug) || parentingArticles[0]; }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const { slug } = await params; const article = getArticle(slug); return { title: `${article.title} | Baebe Boo Parenting Hub`, description: article.excerpt }; }

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticle(slug);
  return (
    <StorefrontPage>
      <article className="storefront-article storefront-shell pb-20 pt-28 sm:pt-32">
        <Link href="/parenting" className="mb-10 inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} /> Parenting Hub</Link>
        <header><p className="storefront-eyebrow">{article.category} · {article.minutes} min read</p><h1>{article.title}</h1><p>{article.excerpt}</p></header>
        <div className="storefront-article-hero"><BookOpen size={48} /><span>Baebe Boo family guide</span></div>
        <div className="storefront-article-body"><p className="storefront-article-deck">Every child and family is different. Use this gentle guide as a practical starting point, keep what works for you, and ask a qualified health professional whenever you have a concern.</p><h2>Begin with what matters most</h2><p>Comfort, safety and connection matter more than having every possible product. Start with a small set of essentials that suit your routine, space and child&apos;s current stage.</p><ul><li><Check size={17} />Choose age-appropriate items and follow the maker&apos;s safety guidance.</li><li><Check size={17} />Look for easy-care materials that can handle everyday family life.</li><li><Check size={17} />Introduce one change at a time so you can notice what works.</li></ul><h2>Keep the routine gentle</h2><p>Children often respond best to calm repetition. Prepare what you need in advance, leave a little extra time, and remember that a routine is there to support your family—not to become another source of pressure.</p><aside><strong>A Baebe Boo note</strong><p>Our team can help you compare sizes, materials and age suitability. Product guidance is not a substitute for medical advice.</p></aside><h2>Make it your own</h2><p>The best choice is the one that is safe, realistic and right for your family. Small adjustments and patient observation will take you a long way.</p></div>
      </article>
    </StorefrontPage>
  );
}
