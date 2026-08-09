import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { recordAudit, type AdminActor } from "./audit";
import type {
  ContentAuthorCreateInput,
  ContentAuthorPatchInput,
  ContentPostCreateInput,
  ContentPostPatchInput,
  ContentPostProductInput,
} from "./content-schemas";

export class AdminContentError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AdminContentError";
  }
}

function databaseFailure(message: string): never {
  throw new AdminContentError(409, message);
}

function camelCasePost(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    authorId: row.author_id ? String(row.author_id) : null,
    slug: String(row.slug),
    title: String(row.title),
    excerpt: String(row.excerpt || ""),
    body: row.body as Record<string, unknown>,
    heroImageUrl: String(row.hero_image_url || ""),
    imageAlt: String(row.image_alt || ""),
    status: String(row.status),
    seoTitle: String(row.seo_title || ""),
    seoDescription: String(row.seo_description || ""),
    publishedAt: row.published_at ? String(row.published_at) : null,
    scheduledFor: row.scheduled_for ? String(row.scheduled_for) : null,
    category: String(row.category || "Parenting"),
    minutes: Number(row.minutes || 5),
    ctaLabel: row.cta_label ? String(row.cta_label) : null,
    ctaHref: row.cta_href ? String(row.cta_href) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function camelCaseAuthor(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    bio: String(row.bio || ""),
    avatarUrl: String(row.avatar_url || ""),
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
  };
}

export async function listContentPosts(options?: { status?: string }) {
  let query = supabaseAdmin
    .from("content_posts")
    .select(
      "id,author_id,slug,title,excerpt,body,hero_image_url,image_alt,status,seo_title,seo_description,published_at,scheduled_for,category,minutes,cta_label,cta_href,created_at,updated_at",
    )
    .order("created_at", { ascending: false });
  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }
  const { data, error } = await query;
  if (error) databaseFailure("Could not load content posts.");
  return (data || []).map(camelCasePost);
}

export async function getContentPost(id: string) {
  const { data, error } = await supabaseAdmin
    .from("content_posts")
    .select(
      "id,author_id,slug,title,excerpt,body,hero_image_url,image_alt,status,seo_title,seo_description,published_at,scheduled_for,category,minutes,cta_label,cta_href,created_at,updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) databaseFailure("Could not load content post.");
  if (!data) throw new AdminContentError(404, "Content post not found.");
  return camelCasePost(data);
}

export async function createContentPost(
  input: ContentPostCreateInput,
  actor: AdminActor,
) {
  if (input.authorId) {
    const { data: author } = await supabaseAdmin
      .from("content_authors")
      .select("id")
      .eq("id", input.authorId)
      .maybeSingle();
    if (!author) throw new AdminContentError(400, "Selected author not found.");
  }

  const { data: existing } = await supabaseAdmin
    .from("content_posts")
    .select("id")
    .eq("slug", input.slug)
    .maybeSingle();
  if (existing) throw new AdminContentError(409, "That slug is already in use.");

  const { data: post, error } = await supabaseAdmin
    .from("content_posts")
    .insert({
      author_id: input.authorId || null,
      slug: input.slug,
      title: input.title,
      excerpt: input.excerpt || null,
      body: input.body as unknown as Record<string, unknown>,
      hero_image_url: input.heroImageUrl || null,
      image_alt: input.imageAlt || null,
      status: input.status,
      seo_title: input.seoTitle || null,
      seo_description: input.seoDescription || null,
      published_at: input.publishedAt || null,
      scheduled_for: input.scheduledFor || null,
      category: input.category,
      minutes: input.minutes,
      cta_label: input.ctaLabel || null,
      cta_href: input.ctaHref || null,
    })
    .select(
      "id,author_id,slug,title,excerpt,body,hero_image_url,image_alt,status,seo_title,seo_description,published_at,scheduled_for,category,minutes,cta_label,cta_href,created_at,updated_at",
    )
    .single();

  if (error || !post) databaseFailure("Could not create content post.");
  await recordAudit(actor, "create", "content_posts", post.id, null, input);
  return camelCasePost(post);
}

export async function patchContentPost(
  id: string,
  patch: ContentPostPatchInput,
  actor: AdminActor,
) {
  const previous = await getContentPost(id);

  if (patch.slug && patch.slug !== previous.slug) {
    const { data: existing } = await supabaseAdmin
      .from("content_posts")
      .select("id")
      .eq("slug", patch.slug)
      .maybeSingle();
    if (existing) throw new AdminContentError(409, "That slug is already in use.");
  }

  if (patch.authorId) {
    const { data: author } = await supabaseAdmin
      .from("content_authors")
      .select("id")
      .eq("id", patch.authorId)
      .maybeSingle();
    if (!author) throw new AdminContentError(400, "Selected author not found.");
  }

  const changes: Record<string, unknown> = {
    ...(patch.authorId !== undefined && { author_id: patch.authorId || null }),
    ...(patch.slug !== undefined && { slug: patch.slug }),
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.excerpt !== undefined && { excerpt: patch.excerpt || null }),
    ...(patch.body !== undefined && { body: patch.body as unknown as Record<string, unknown> }),
    ...(patch.heroImageUrl !== undefined && { hero_image_url: patch.heroImageUrl || null }),
    ...(patch.imageAlt !== undefined && { image_alt: patch.imageAlt || null }),
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.seoTitle !== undefined && { seo_title: patch.seoTitle || null }),
    ...(patch.seoDescription !== undefined && { seo_description: patch.seoDescription || null }),
    ...(patch.publishedAt !== undefined && { published_at: patch.publishedAt || null }),
    ...(patch.scheduledFor !== undefined && { scheduled_for: patch.scheduledFor || null }),
    ...(patch.category !== undefined && { category: patch.category }),
    ...(patch.minutes !== undefined && { minutes: patch.minutes }),
    ...(patch.ctaLabel !== undefined && { cta_label: patch.ctaLabel || null }),
    ...(patch.ctaHref !== undefined && { cta_href: patch.ctaHref || null }),
  };

  if (Object.keys(changes).length === 0) return previous;

  const { data: post, error } = await supabaseAdmin
    .from("content_posts")
    .update(changes)
    .eq("id", id)
    .select(
      "id,author_id,slug,title,excerpt,body,hero_image_url,image_alt,status,seo_title,seo_description,published_at,scheduled_for,category,minutes,cta_label,cta_href,created_at,updated_at",
    )
    .single();

  if (error || !post) databaseFailure("Could not update content post.");
  await recordAudit(actor, "update", "content_posts", id, previous, patch);
  return camelCasePost(post);
}

export async function archiveContentPost(id: string, actor: AdminActor) {
  const previous = await getContentPost(id);
  const { data: post, error } = await supabaseAdmin
    .from("content_posts")
    .update({ status: "archived" })
    .eq("id", id)
    .select(
      "id,author_id,slug,title,excerpt,body,hero_image_url,image_alt,status,seo_title,seo_description,published_at,scheduled_for,category,minutes,cta_label,cta_href,created_at,updated_at",
    )
    .single();
  if (error || !post) databaseFailure("Could not archive content post.");
  await recordAudit(actor, "archive", "content_posts", id, previous, { status: "archived" });
  return camelCasePost(post);
}

export async function listContentAuthors() {
  const { data, error } = await supabaseAdmin
    .from("content_authors")
    .select("id,name,bio,avatar_url,is_active,created_at")
    .order("name", { ascending: true });
  if (error) databaseFailure("Could not load content authors.");
  return (data || []).map(camelCaseAuthor);
}

export async function createContentAuthor(
  input: ContentAuthorCreateInput,
  actor: AdminActor,
) {
  const { data: author, error } = await supabaseAdmin
    .from("content_authors")
    .insert({
      name: input.name,
      bio: input.bio || null,
      avatar_url: input.avatarUrl || null,
      is_active: input.isActive,
    })
    .select("id,name,bio,avatar_url,is_active,created_at")
    .single();
  if (error || !author) databaseFailure("Could not create content author.");
  await recordAudit(actor, "create", "content_authors", author.id, null, input);
  return camelCaseAuthor(author);
}

export async function patchContentAuthor(
  id: string,
  patch: ContentAuthorPatchInput,
  actor: AdminActor,
) {
  const previous = await supabaseAdmin
    .from("content_authors")
    .select("id,name,bio,avatar_url,is_active,created_at")
    .eq("id", id)
    .maybeSingle();
  if (previous.error || !previous.data) {
    throw new AdminContentError(404, "Content author not found.");
  }

  const changes: Record<string, unknown> = {
    ...(patch.name !== undefined && { name: patch.name }),
    ...(patch.bio !== undefined && { bio: patch.bio || null }),
    ...(patch.avatarUrl !== undefined && { avatar_url: patch.avatarUrl || null }),
    ...(patch.isActive !== undefined && { is_active: patch.isActive }),
  };

  if (Object.keys(changes).length === 0) return camelCaseAuthor(previous.data);

  const { data: author, error } = await supabaseAdmin
    .from("content_authors")
    .update(changes)
    .eq("id", id)
    .select("id,name,bio,avatar_url,is_active,created_at")
    .single();
  if (error || !author) databaseFailure("Could not update content author.");
  await recordAudit(actor, "update", "content_authors", id, previous.data, patch);
  return camelCaseAuthor(author);
}

export async function deleteContentAuthor(id: string, actor: AdminActor) {
  const previous = await supabaseAdmin
    .from("content_authors")
    .select("id,name,bio,avatar_url,is_active,created_at")
    .eq("id", id)
    .maybeSingle();
  if (previous.error || !previous.data) {
    throw new AdminContentError(404, "Content author not found.");
  }
  const { error } = await supabaseAdmin.from("content_authors").delete().eq("id", id);
  if (error) databaseFailure("Could not delete content author.");
  await recordAudit(actor, "delete", "content_authors", id, previous.data, null);
}

export async function listContentPostProducts(postId: string) {
  const { data, error } = await supabaseAdmin
    .from("content_post_products")
    .select("product_id, sort_order, products(id,name,sku,image_url)")
    .eq("post_id", postId)
    .order("sort_order", { ascending: true });
  if (error) databaseFailure("Could not load related products.");
  return (data || []).map((row) => {
    const products = (row.products as Array<Record<string, unknown>> | null) || [];
    const product = products[0] || {};
    return {
      productId: String(row.product_id),
      sortOrder: Number(row.sort_order),
      name: String(product.name || "Product"),
      sku: String(product.sku || ""),
      imageUrl: String(product.image_url || ""),
    };
  });
}

export async function addContentPostProduct(
  postId: string,
  input: ContentPostProductInput,
  actor: AdminActor,
) {
  const { data: existing } = await supabaseAdmin
    .from("content_post_products")
    .select("product_id")
    .eq("post_id", postId)
    .eq("product_id", input.productId)
    .maybeSingle();
  if (existing) throw new AdminContentError(409, "Product is already linked.");

  const { error } = await supabaseAdmin.from("content_post_products").insert({
    post_id: postId,
    product_id: input.productId,
    sort_order: input.sortOrder,
  });
  if (error) databaseFailure("Could not link product.");
  await recordAudit(actor, "link_product", "content_post_products", postId, null, input);
}

export async function removeContentPostProduct(
  postId: string,
  productId: string,
  actor: AdminActor,
) {
  const { error } = await supabaseAdmin
    .from("content_post_products")
    .delete()
    .eq("post_id", postId)
    .eq("product_id", productId);
  if (error) databaseFailure("Could not unlink product.");
  await recordAudit(actor, "unlink_product", "content_post_products", postId, { productId }, null);
}
