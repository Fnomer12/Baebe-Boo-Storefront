import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Heart, Sparkles } from "lucide-react";
import { PageIntro, StorefrontPage } from "@/components/storefront/StorefrontChrome";
import { listPublishedContentPosts } from "@/lib/content";

export const metadata: Metadata = {
  title: "Parenting Hub",
  description: "Gentle, practical guides for newborn care, feeding, play and choosing children's essentials.",
};

export default async function ParentingPage() {
  const articles = await listPublishedContentPosts();
  if (articles.length === 0) notFound();

  const featured = articles[0];
  const practical = articles.slice(1);

  return (
    <StorefrontPage>
      <div className="storefront-shell storefront-parenting-page pb-24 pt-28 sm:pt-32">
        <PageIntro
          eyebrow="The Parenting Hub"
          title="A little guidance for all the growing."
          description="Warm, practical reading for real family days—from first feeds and sleepy nights to busy feet and big imaginations."
        />
        <section className="storefront-featured-article">
          <div className="storefront-featured-article-copy">
            <span className="storefront-eyebrow"><Heart size={14} /> Start here</span>
            <h2>{featured.title}</h2>
            <p>{featured.excerpt}</p>
            <Link href={`/parenting/${featured.slug}`} className="storefront-primary-button">Read the guide <ArrowRight size={17} /></Link>
          </div>
          <div className="storefront-featured-article-photo">
            <Image
              src={featured.heroImageUrl}
              alt={featured.imageAlt}
              width={1792}
              height={1024}
              priority
            />
          </div>
        </section>

        {practical.length > 0 && (
          <section className="mt-12">
            <div className="storefront-section-heading">
              <div>
                <p className="storefront-eyebrow"><Sparkles size={14} /> Practical reads</p>
                <h2>Guides for real family days</h2>
              </div>
              <Link href="/store">Shop essentials <ArrowRight size={16} /></Link>
            </div>
            <div className="storefront-article-grid">
              {practical.map((article) => (
                <Link href={`/parenting/${article.slug}`} key={article.slug} className="storefront-article-card">
                  <span className="storefront-article-photo">
                    <Image src={article.heroImageUrl} alt={article.imageAlt} width={1200} height={800} />
                  </span>
                  <div className="storefront-article-body-text">
                    <span className="storefront-article-tag">{article.category}</span>
                    <h3>{article.title}</h3>
                    <p>{article.excerpt}</p>
                    <small>{article.minutes} min read <ArrowRight size={14} /></small>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </StorefrontPage>
  );
}
