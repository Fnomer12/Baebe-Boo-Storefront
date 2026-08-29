import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { StorefrontPage } from "@/components/storefront/StorefrontChrome";
import { ArticleShare } from "@/components/storefront/ArticleShare";
import { getPublishedContentPost, listPublishedContentPosts } from "@/lib/content";

function slugifyHeading(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function formatDate(iso: string | undefined) {
  if (!iso) return undefined;
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return undefined;
  }
}

export async function generateStaticParams() {
  // A build without reachable Supabase credentials (CI, a fresh Vercel
  // preview) must not fail the whole deploy over prerender params — the
  // articles simply render on demand instead.
  try {
    const posts = await listPublishedContentPosts();
    return posts.map((post) => ({ slug: post.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublishedContentPost(slug);
  if (!result) return { title: "Guide not found | Baebe Boo Parenting Hub" };
  return {
    title: result.post.seoTitle || `${result.post.title} | Baebe Boo Parenting Hub`,
    description: result.post.seoDescription || result.post.excerpt,
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getPublishedContentPost(slug);
  if (!result) notFound();

  const { post, relatedProducts } = result;
  const toc = post.body.sections.map((section) => ({
    id: slugifyHeading(section.heading),
    heading: section.heading,
  }));

  const updatedAt = formatDate(post.updatedAt);
  const authorName = post.author?.name || "Baebe Boo Care Team";

  return (
    <StorefrontPage>
      <article className="storefront-article storefront-shell pb-24 pt-28 sm:pt-32">
        <Link href="/parenting" className="storefront-article-back">
          <ArrowLeft size={16} /> Parenting Hub
        </Link>

        <header>
          <p className="storefront-eyebrow">{post.category} · {post.minutes} min read</p>
          <h1>{post.title}</h1>
          <p>{post.excerpt}</p>
          <div className="storefront-article-meta">
            <span>
              By <strong>{authorName}</strong>
              {updatedAt && <> · Updated {updatedAt}</>}
            </span>
            <ArticleShare url={`https://baebeboo.com/parenting/${post.slug}`} />
          </div>
        </header>

        <div className="storefront-article-hero">
          <Image src={post.heroImageUrl} alt={post.imageAlt} width={1400} height={933} priority />
        </div>

        <div className="storefront-article-layout">
          <nav className="storefront-article-toc" aria-label="Guide sections">
            <p>In this guide</p>
            <ol>
              {toc.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`}>{item.heading}</a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="storefront-article-body">
            <p className="storefront-article-deck">{post.body.deck}</p>
            {post.body.sections.map((section, index) => {
              const sectionId = slugifyHeading(section.heading);
              return (
                <Fragment key={section.heading}>
                  {index === 1 && post.body.note && (
                    <aside className="storefront-article-note">
                      <strong>A Baebe Boo note</strong>
                      <p>{post.body.note}</p>
                    </aside>
                  )}
                  <section id={sectionId} aria-labelledby={`heading-${sectionId}`}>
                    <h2 id={`heading-${sectionId}`}>{section.heading}</h2>
                    {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                    {section.list && section.list.length > 0 && (
                      <ul className={section.list.length > 4 ? "storefront-article-checklist" : undefined}>
                        {section.list.map((item, itemIndex) => (
                          <li key={item}>
                            <span aria-hidden="true">
                              <Check size={17} />
                            </span>
                            <span>{item}</span>
                            {itemIndex === section.list!.length - 1 && section.list!.length > 4 && (
                              <span className="storefront-article-checklist-count" aria-hidden="true">
                                {section.list!.length} items
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </Fragment>
              );
            })}

            {(post.ctaLabel && post.ctaHref) || relatedProducts.length > 0 ? (
              <div className="storefront-article-cta">
                <div>
                  <strong>{post.ctaLabel || "Ready to put this into practice?"}</strong>
                  <p>Browse trusted essentials chosen with real family days in mind.</p>
                </div>
                {post.ctaHref && (
                  <Link href={post.ctaHref} className="storefront-primary-button">
                    {post.ctaLabel || "Shop essentials"} <ArrowRight size={17} />
                  </Link>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <section className="storefront-related-articles">
          <div className="storefront-section-heading">
            <div>
              <p className="storefront-eyebrow">More guidance</p>
              <h2>Keep reading</h2>
            </div>
            <Link href="/parenting">All guides <ArrowRight size={16} /></Link>
          </div>
          <div className="storefront-article-grid">
            {relatedProducts.map((product) => (
              <Link href={`/products/${product.slug}`} key={product.id} className="storefront-article-card">
                <span className="storefront-article-photo">
                  <Image src={product.imageUrl || "/parenting/hub-generated.png"} alt={product.name} width={900} height={600} />
                </span>
                <div className="storefront-article-body-text">
                  <span className="storefront-article-tag">{product.sku}</span>
                  <h3>{product.name}</h3>
                  <p>GH₵{product.price.toLocaleString()}</p>
                  <small>View product <ArrowRight size={14} /></small>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </article>
    </StorefrontPage>
  );
}
