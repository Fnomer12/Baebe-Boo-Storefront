import "server-only";

import { slugify } from "@/components/storefront/catalog-data";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type PublicContentPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  minutes: number;
  heroImageUrl: string;
  imageAlt: string;
  body: {
    deck: string;
    sections: Array<{
      heading: string;
      paragraphs: string[];
      list: string[];
    }>;
    note: string;
  };
  author: {
    name: string;
    bio: string;
    avatarUrl: string;
  } | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  publishedAt: string;
  updatedAt: string;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type PublicRelatedProduct = {
  id: string;
  name: string;
  sku: string;
  price: number;
  imageUrl: string;
  slug: string;
};

function camelCasePost(row: Record<string, unknown>): PublicContentPost {
  const body = (row.body as PublicContentPost["body"]) || { deck: "", sections: [], note: "" };
  const author = row.author as Record<string, unknown> | null;
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    excerpt: String(row.excerpt || ""),
    category: String(row.category || "Parenting"),
    minutes: Number(row.minutes || 5),
    heroImageUrl: String(row.hero_image_url || "/parenting/hub-generated.png"),
    imageAlt: String(row.image_alt || row.title),
    body: {
      deck: body.deck || "",
      sections: Array.isArray(body.sections)
        ? body.sections.map((section) => ({
            heading: section.heading || "",
            paragraphs: Array.isArray(section.paragraphs) ? section.paragraphs : [],
            list: Array.isArray(section.list) ? section.list : [],
          }))
        : [],
      note: body.note || "",
    },
    author: author
      ? {
          name: String(author.name || "Baebe Boo Care Team"),
          bio: String(author.bio || ""),
          avatarUrl: String(author.avatar_url || ""),
        }
      : null,
    ctaLabel: row.cta_label ? String(row.cta_label) : null,
    ctaHref: row.cta_href ? String(row.cta_href) : null,
    publishedAt: String(row.published_at || row.created_at),
    updatedAt: String(row.updated_at || row.created_at),
    seoTitle: row.seo_title ? String(row.seo_title) : null,
    seoDescription: row.seo_description ? String(row.seo_description) : null,
  };
}

export async function listPublishedContentPosts(): Promise<PublicContentPost[]> {
  const { data, error } = await supabaseAdmin
    .from("content_posts")
    .select(
      "id,slug,title,excerpt,body,hero_image_url,image_alt,category,minutes,cta_label,cta_href,seo_title,seo_description,published_at,updated_at,created_at,content_authors(name,bio,avatar_url)",
    )
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false });

  if (error) {
    throw new Error("Could not load parenting articles.");
  }
  return (data || []).map((row) => camelCasePost(row as Record<string, unknown>));
}

export async function getPublishedContentPost(slug: string): Promise<{
  post: PublicContentPost;
  relatedProducts: PublicRelatedProduct[];
} | null> {
  const { data, error } = await supabaseAdmin
    .from("content_posts")
    .select(
      "id,slug,title,excerpt,body,hero_image_url,image_alt,category,minutes,cta_label,cta_href,seo_title,seo_description,published_at,updated_at,created_at,content_authors(name,bio,avatar_url)",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    throw new Error("Could not load parenting article.");
  }
  if (!data) return null;

  const post = camelCasePost(data as Record<string, unknown>);

  const { data: relatedData, error: relatedError } = await supabaseAdmin
    .from("content_post_products")
    .select("sort_order,products(id,name,sku,price,image_url)")
    .eq("post_id", post.id)
    .order("sort_order", { ascending: true });

  if (relatedError) {
    throw new Error("Could not load related products.");
  }

  const relatedProducts = (relatedData || [])
    .map((row) => {
      const products = (row.products as Array<Record<string, unknown>> | null) || [];
      const product = products[0] || {};
      return {
        id: String(product.id || ""),
        name: String(product.name || "Product"),
        sku: String(product.sku || ""),
        price: Number(product.price || 0),
        imageUrl: String(product.image_url || ""),
        slug: `${slugify(String(product.name || ""))}-${String(product.id || "")}`,
      };
    })
    .filter((product) => product.id);

  return { post, relatedProducts };
}
