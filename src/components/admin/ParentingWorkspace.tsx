"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, useRef } from "react";
import Image from "next/image";
import {
  BookOpen,
  ChevronDown,
  Edit3,
  ImageIcon,
  PenTool,
  Plus,
  Save,
  Trash2,
  User,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  AdminDataTable,
  AdminEmptyState,
  AdminErrorState,
  AdminFilterBar,
  AdminModal,
  type AdminTableColumn,
} from "@/components/admin/AdminWorkspacePrimitives";
import { useDialogBehaviour } from "@/components/admin/use-dialog-behaviour";

type ContentStatus = "draft" | "scheduled" | "published" | "archived";

type ContentPost = {
  id: string;
  authorId: string | null;
  slug: string;
  title: string;
  excerpt: string;
  body: {
    deck: string;
    sections: Array<{
      heading: string;
      paragraphs: string[];
      list: string[];
    }>;
    note: string;
  };
  heroImageUrl: string;
  imageAlt: string;
  status: ContentStatus;
  seoTitle: string;
  seoDescription: string;
  publishedAt: string | null;
  scheduledFor: string | null;
  category: string;
  minutes: number;
  ctaLabel: string | null;
  ctaHref: string | null;
  createdAt: string;
  updatedAt: string;
};

type ContentAuthor = {
  id: string;
  name: string;
  bio: string;
  avatarUrl: string;
  isActive: boolean;
  createdAt: string;
};

type RelatedProduct = {
  productId: string;
  sortOrder: number;
  name: string;
  sku: string;
  imageUrl: string;
};

type CatalogProduct = {
  id: string;
  name: string;
  sku: string;
  imageUrl: string;
  active: boolean;
};

const statusColors: Record<ContentStatus, string> = {
  draft: "bg-amber-100 text-amber-800",
  scheduled: "bg-sky-100 text-sky-800",
  published: "bg-emerald-100 text-emerald-800",
  archived: "bg-black/[0.06] text-black/45",
};

const emptyBody: ContentPost["body"] = {
  deck: "",
  sections: [{ heading: "", paragraphs: [""], list: [] }],
  note: "",
};

const emptyPost: Omit<ContentPost, "id" | "createdAt" | "updatedAt"> = {
  authorId: null,
  slug: "",
  title: "",
  excerpt: "",
  body: emptyBody,
  heroImageUrl: "",
  imageAlt: "",
  status: "draft",
  seoTitle: "",
  seoDescription: "",
  publishedAt: null,
  scheduledFor: null,
  category: "Parenting",
  minutes: 5,
  ctaLabel: null,
  ctaHref: null,
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toDatetimeLocal(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export default function ParentingWorkspace() {
  const [tab, setTab] = useState<"articles" | "authors">("articles");

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#28637d]">Content</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Parenting Hub</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">
          Create, schedule, and link products to parenting guides and articles.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === "articles"} onClick={() => setTab("articles")} icon={<BookOpen size={16} />} label="Articles" />
        <TabButton active={tab === "authors"} onClick={() => setTab("authors")} icon={<PenTool size={16} />} label="Authors" />
      </div>

      {tab === "articles" ? <ArticlesTab /> : <AuthorsTab />}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
        active ? "bg-[#28637d] text-white" : "bg-[#f3f5f7] text-black/55 hover:bg-[#eaf6fb] hover:text-[#28637d]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ArticlesTab() {
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [authors, setAuthors] = useState<ContentAuthor[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | ContentStatus>("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ContentPost | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [postsRes, authorsRes, productsRes] = await Promise.all([
        fetch(`/api/admin/content-posts?status=${status}`),
        fetch("/api/admin/content-authors"),
        fetch("/api/admin/products?status=active&pageSize=500"),
      ]);
      const postsJson = await postsRes.json().catch(() => ({}));
      const authorsJson = await authorsRes.json().catch(() => ({}));
      const productsJson = await productsRes.json().catch(() => ({}));
      if (!postsRes.ok) throw new Error(postsJson.message || "Articles could not be loaded.");
      setPosts(normalizePosts(postsJson.posts));
      setAuthors(normalizeAuthors(authorsJson.authors));
      setProducts(normalizeProducts(productsJson.products));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Articles could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filteredPosts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return posts;
    return posts.filter(
      (post) =>
        post.title.toLowerCase().includes(needle) ||
        post.slug.toLowerCase().includes(needle) ||
        post.excerpt.toLowerCase().includes(needle),
    );
  }, [posts, query]);

  async function handleDelete(post: ContentPost) {
    if (!window.confirm(`Archive "${post.title}"?`)) return;
    const response = await fetch(`/api/admin/content-posts/${post.id}`, { method: "DELETE" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.message || "Article could not be archived.");
      return;
    }
    await load();
  }

  function openCreate() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(post: ContentPost) {
    setEditing(post);
    setShowForm(true);
  }

  const columns: AdminTableColumn<ContentPost>[] = [
    { key: "title", header: "Article", cell: (row) => <span className="font-medium">{row.title}</span> },
    { key: "slug", header: "Slug", cell: (row) => <span className="text-black/50">{row.slug}</span> },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    { key: "dates", header: "Dates", cell: (row) => `${formatDate(row.publishedAt || row.scheduledFor)}` },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton label="Edit article" onClick={() => openEdit(row)}><Edit3 size={14} /></IconButton>
          <IconButton label="Archive article" onClick={() => handleDelete(row)}><Trash2 size={14} /></IconButton>
        </div>
      ),
    },
  ];

  if (error) return <AdminErrorState description={error} onRetry={() => void load()} />;
  if (loading) return <LoadingState />;

  return (
    <section className="space-y-4">
      <AdminFilterBar
        query={query}
        onQueryChange={setQuery}
        queryLabel="Search articles"
        placeholder="Search articles by title or slug..."
      >
        <div className="relative">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="admin-input admin-select text-sm"
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-black/40" aria-hidden="true" />
        </div>
      </AdminFilterBar>

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-black/55">{filteredPosts.length} article(s)</p>
        <button type="button" onClick={openCreate} className="admin-button px-4 py-2 text-sm">
          <Plus size={16} /> New article
        </button>
      </div>

      {filteredPosts.length === 0 ? (
        <AdminEmptyState
          title="No articles"
          description="Create your first parenting guide or article."
          icon={<BookOpen size={24} />}
          action={
            <button type="button" onClick={openCreate} className="admin-button px-4 py-2 text-sm">
              <Plus size={16} /> New article
            </button>
          }
        />
      ) : (
        <AdminDataTable rows={filteredPosts} columns={columns} rowKey={(row) => row.id} caption="Parenting articles" />
      )}

      <ArticleFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        initial={editing}
        authors={authors}
        products={products}
        onSaved={load}
      />
    </section>
  );
}

function ArticleFormModal({
  open,
  onClose,
  initial,
  authors,
  products,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: ContentPost | null;
  authors: ContentAuthor[];
  products: CatalogProduct[];
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({ ...emptyPost });
  const [relatedProducts, setRelatedProducts] = useState<RelatedProduct[]>([]);
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [heroPreview, setHeroPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadRelatedProducts(postId: string) {
    const response = await fetch(`/api/admin/content-posts/${postId}/products`);
    const json = await response.json().catch(() => ({}));
    if (response.ok) setRelatedProducts(json.products || []);
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        authorId: initial.authorId,
        slug: initial.slug,
        title: initial.title,
        excerpt: initial.excerpt,
        body: initial.body,
        heroImageUrl: initial.heroImageUrl,
        imageAlt: initial.imageAlt,
        status: initial.status,
        seoTitle: initial.seoTitle,
        seoDescription: initial.seoDescription,
        publishedAt: initial.publishedAt,
        scheduledFor: initial.scheduledFor,
        category: initial.category,
        minutes: initial.minutes,
        ctaLabel: initial.ctaLabel,
        ctaHref: initial.ctaHref,
      });
      setHeroPreview(initial.heroImageUrl || null);
      void loadRelatedProducts(initial.id);
    } else {
      setForm({ ...emptyPost });
      setHeroPreview(null);
      setRelatedProducts([]);
    }
    setHeroFile(null);
    setError("");
  }, [open, initial]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleHeroChange(file: File | null) {
    if (!file) {
      setHeroFile(null);
      setHeroPreview(form.heroImageUrl || null);
      return;
    }
    setHeroFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setHeroPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function uploadHero() {
    if (!heroFile) return form.heroImageUrl || undefined;
    const ext = heroFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const filePath = `content/${fileName}`;
    const { error: uploadError } = await supabase.storage.from("product-images").upload(filePath, heroFile);
    if (uploadError) throw new Error(uploadError.message);
    const { data } = supabase.storage.from("product-images").getPublicUrl(filePath);
    return data.publicUrl;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const heroImageUrl = await uploadHero();
      const payload = {
        ...form,
        // The API schemas treat undefined as "not set" and reject null, so
        // unset optional fields must be omitted from the JSON payload.
        authorId: form.authorId || undefined,
        heroImageUrl,
        ctaLabel: form.ctaLabel || undefined,
        ctaHref: form.ctaHref || undefined,
        publishedAt: form.status === "published" && !form.publishedAt ? new Date().toISOString() : form.publishedAt || undefined,
        scheduledFor: form.status === "scheduled" ? form.scheduledFor || undefined : undefined,
      };

      const response = await fetch(
        initial ? `/api/admin/content-posts/${initial.id}` : "/api/admin/content-posts",
        {
          method: initial ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.message || "Article could not be saved.");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save article.");
    } finally {
      setSaving(false);
    }
  }

  function updateSection(index: number, updates: Partial<ContentPost["body"]["sections"][number]>) {
    setForm((current) => ({
      ...current,
      body: {
        ...current.body,
        sections: current.body.sections.map((section, i) =>
          i === index ? { ...section, ...updates } : section,
        ),
      },
    }));
  }

  function addSection() {
    setForm((current) => ({
      ...current,
      body: {
        ...current.body,
        sections: [...current.body.sections, { heading: "", paragraphs: [""], list: [] }],
      },
    }));
  }

  function removeSection(index: number) {
    setForm((current) => ({
      ...current,
      body: {
        ...current.body,
        sections: current.body.sections.filter((_, i) => i !== index),
      },
    }));
  }

  function updateParagraph(sectionIndex: number, paragraphIndex: number, value: string) {
    setForm((current) => ({
      ...current,
      body: {
        ...current.body,
        sections: current.body.sections.map((section, i) =>
          i === sectionIndex
            ? {
                ...section,
                paragraphs: section.paragraphs.map((p, j) => (j === paragraphIndex ? value : p)),
              }
            : section,
        ),
      },
    }));
  }

  function addParagraph(sectionIndex: number) {
    setForm((current) => ({
      ...current,
      body: {
        ...current.body,
        sections: current.body.sections.map((section, i) =>
          i === sectionIndex ? { ...section, paragraphs: [...section.paragraphs, ""] } : section,
        ),
      },
    }));
  }

  function removeParagraph(sectionIndex: number, paragraphIndex: number) {
    setForm((current) => ({
      ...current,
      body: {
        ...current.body,
        sections: current.body.sections.map((section, i) =>
          i === sectionIndex
            ? { ...section, paragraphs: section.paragraphs.filter((_, j) => j !== paragraphIndex) }
            : section,
        ),
      },
    }));
  }

  function updateList(sectionIndex: number, value: string) {
    setForm((current) => ({
      ...current,
      body: {
        ...current.body,
        sections: current.body.sections.map((section, i) =>
          i === sectionIndex
            ? { ...section, list: value.split("\n").map((item) => item.trim()).filter(Boolean) }
            : section,
        ),
      },
    }));
  }

  async function linkProduct(productId: string) {
    if (!initial) {
      setError("Save the article first before linking products.");
      return;
    }
    const response = await fetch(`/api/admin/content-posts/${initial.id}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, sortOrder: relatedProducts.length }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.message || "Could not link product.");
      return;
    }
    setRelatedProducts(json.products || []);
  }

  async function unlinkProduct(productId: string) {
    if (!initial) return;
    const response = await fetch(`/api/admin/content-posts/${initial.id}/products?productId=${productId}`, {
      method: "DELETE",
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.message || "Could not unlink product.");
      return;
    }
    setRelatedProducts(json.products || []);
  }

  const availableProducts = products.filter(
    (product) => !relatedProducts.some((related) => related.productId === product.id),
  );

  const editorRef = useRef<HTMLDivElement | null>(null);
  useDialogBehaviour(open, editorRef, onClose);

  if (!open) return null;

  return (
    // Not `AdminModal`: an article editor needs the whole screen and its own
    // header (status badge + Save sit beside the title, not below the body).
    // It gets the same dialog behaviour through the shared hook, so Escape,
    // focus trapping, focus restore and scroll lock all work here too.
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--color-ink)]/20 backdrop-blur-sm"
        aria-label="Close modal"
        tabIndex={-1}
      />
      <div
        ref={editorRef}
        role="dialog"
        aria-modal="true"
        aria-label={initial ? "Edit article" : "New article"}
        tabIndex={-1}
        className="absolute inset-0 flex flex-col overflow-hidden bg-[var(--color-surface)] shadow-2xl outline-none sm:inset-4 sm:rounded-3xl sm:border sm:border-[var(--color-line)] lg:inset-x-16"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-line)] px-5 py-4">
          <div className="min-w-0">
            <p className="hidden text-xs font-bold uppercase tracking-widest sm:block" style={{ color: "var(--color-brand-deep)" }}>
              Parenting Hub
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold sm:text-2xl">{initial ? "Edit article" : "New article"}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`hidden rounded-full px-3 py-1 text-xs font-bold xs:inline ${statusColors[form.status]}`}>
              {form.status}
            </span>
            <button type="submit" form="article-editor-form" disabled={saving} className="admin-button px-3 py-2 text-xs sm:px-4 sm:text-sm">
              {saving ? "Saving…" : initial ? "Update article" : "Create article"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-cream)]"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <form id="article-editor-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-4">
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

              <label className="block text-sm font-semibold text-black/70">
                Title
                <input
                  value={form.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    setForm((current) => ({
                      ...current,
                      title,
                      slug: initial ? current.slug : slugify(title),
                    }));
                  }}
                  className="admin-input mt-2"
                  required
                />
              </label>

              <label className="block text-sm font-semibold text-black/70">
                Slug
                <input
                  value={form.slug}
                  onChange={(e) => setForm((current) => ({ ...current, slug: e.target.value }))}
                  className="admin-input mt-2"
                  pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                  required
                />
              </label>

              <label className="block text-sm font-semibold text-black/70">
                Excerpt
                <textarea
                  value={form.excerpt}
                  onChange={(e) => setForm((current) => ({ ...current, excerpt: e.target.value }))}
                  className="admin-input mt-2 min-h-[4rem] py-3"
                  rows={2}
                />
              </label>

              <div className="space-y-2">
                <span className="block text-sm font-semibold text-black/70">Hero image</span>
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-black/10 bg-[#f6f7f9] p-6 transition hover:bg-[#eaf6fb]">
                  {heroPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={heroPreview} alt="" className="h-32 rounded-xl object-cover" />
                  ) : (
                    <>
                      <ImageIcon size={24} className="text-black/40" />
                      <span className="text-sm font-semibold">Upload hero image</span>
                    </>
                  )}
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => handleHeroChange(e.target.files?.[0] || null)} />
                </label>
                <label className="block text-xs font-semibold text-black/50">
                  Image alt text
                  <input
                    value={form.imageAlt}
                    onChange={(e) => setForm((current) => ({ ...current, imageAlt: e.target.value }))}
                    className="mt-1.5 h-10 w-full rounded-xl border border-black/10 px-3 text-sm outline-none"
                  />
                </label>
              </div>

              <label className="block text-sm font-semibold text-black/70">
                Deck
                <textarea
                  value={form.body.deck}
                  onChange={(e) => setForm((current) => ({ ...current, body: { ...current.body, deck: e.target.value } }))}
                  className="admin-input mt-2 min-h-[4rem] py-3"
                  rows={2}
                />
              </label>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-black/70">Sections</span>
                  <button type="button" onClick={addSection} className="inline-flex items-center gap-1 rounded-lg bg-[#f3f5f7] px-2 py-1 text-xs font-semibold">
                    <Plus size={12} /> Add section
                  </button>
                </div>
                {form.body.sections.map((section, sectionIndex) => (
                  <div key={sectionIndex} className="rounded-2xl border border-black/[0.07] bg-[#f8fafb] p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <input
                        value={section.heading}
                        onChange={(e) => updateSection(sectionIndex, { heading: e.target.value })}
                        placeholder="Section heading"
                        className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none"
                      />
                      <button type="button" onClick={() => removeSection(sectionIndex)} className="grid h-8 w-8 place-items-center rounded-lg text-red-700 hover:bg-red-50">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="space-y-2">
                      {section.paragraphs.map((paragraph, paragraphIndex) => (
                        <div key={paragraphIndex} className="flex gap-2">
                          <textarea
                            value={paragraph}
                            onChange={(e) => updateParagraph(sectionIndex, paragraphIndex, e.target.value)}
                            placeholder="Paragraph"
                            className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none"
                            rows={2}
                          />
                          <button type="button" onClick={() => removeParagraph(sectionIndex, paragraphIndex)} className="grid h-8 w-8 place-items-center self-start rounded-lg text-black/40 hover:bg-black/[0.06]">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      <button type="button" onClick={() => addParagraph(sectionIndex)} className="text-xs font-semibold text-[#28637d]">
                        + Add paragraph
                      </button>
                    </div>
                    <label className="mt-3 block text-xs font-semibold text-black/50">
                      Checklist items (one per line)
                      <textarea
                        value={section.list.join("\n")}
                        onChange={(e) => updateList(sectionIndex, e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none"
                        rows={3}
                      />
                    </label>
                  </div>
                ))}
              </div>

              <label className="block text-sm font-semibold text-black/70">
                Closing note
                <textarea
                  value={form.body.note}
                  onChange={(e) => setForm((current) => ({ ...current, body: { ...current.body, note: e.target.value } }))}
                  className="admin-input mt-2 min-h-[3rem] py-3"
                  rows={2}
                />
              </label>
            </div>

            <div className="min-w-0 space-y-4">
              <div className="space-y-3 rounded-2xl border border-black/[0.07] bg-[#f8fafb] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Publishing</p>
                <label className="block text-sm font-semibold text-black/70">
                  Status
                  <div className="relative mt-2">
                    <select
                      value={form.status}
                      onChange={(e) => setForm((current) => ({ ...current, status: e.target.value as ContentStatus }))}
                      className="admin-input admin-select"
                    >
                      <option value="draft">Draft</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="published">Published</option>
                      <option value="archived">Archived</option>
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-black/40" aria-hidden="true" />
                  </div>
                </label>
                <label className="block text-sm font-semibold text-black/70">
                  {form.status === "scheduled" ? "Schedule for" : "Published at"}
                  <input
                    type="datetime-local"
                    value={toDatetimeLocal(form.status === "scheduled" ? form.scheduledFor : form.publishedAt)}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        [form.status === "scheduled" ? "scheduledFor" : "publishedAt"]: e.target.value ? new Date(e.target.value).toISOString() : null,
                      }))
                    }
                    className="admin-input mt-2"
                  />
                </label>
              </div>

              <div className="space-y-3 rounded-2xl border border-black/[0.07] bg-[#f8fafb] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Details</p>
                <label className="block text-sm font-semibold text-black/70">
                  Author
                  <div className="relative mt-2">
                    <select
                      value={form.authorId || ""}
                      onChange={(e) => setForm((current) => ({ ...current, authorId: e.target.value || null }))}
                      className="admin-input admin-select"
                    >
                      <option value="">No author</option>
                      {authors.map((author) => (
                        <option key={author.id} value={author.id}>{author.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-black/40" aria-hidden="true" />
                  </div>
                </label>
                <label className="block text-sm font-semibold text-black/70">
                  Category
                  <input
                    value={form.category}
                    onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))}
                    className="admin-input mt-2"
                  />
                </label>
                <label className="block text-sm font-semibold text-black/70">
                  Minutes
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={form.minutes}
                    onChange={(e) => setForm((current) => ({ ...current, minutes: Number(e.target.value) }))}
                    className="admin-input mt-2"
                  />
                </label>
              </div>

              <div className="space-y-3 rounded-2xl border border-black/[0.07] bg-[#f8fafb] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">CTA</p>
                <label className="block text-sm font-semibold text-black/70">
                  CTA label
                  <input
                    value={form.ctaLabel || ""}
                    onChange={(e) => setForm((current) => ({ ...current, ctaLabel: e.target.value || null }))}
                    className="admin-input mt-2"
                    placeholder="e.g. Shop essentials"
                  />
                </label>
                {form.ctaLabel && (
                  <label className="block text-sm font-semibold text-black/70">
                    CTA link
                    <input
                      value={form.ctaHref || ""}
                      onChange={(e) => setForm((current) => ({ ...current, ctaHref: e.target.value || null }))}
                      className="admin-input mt-2"
                      placeholder="https://..."
                    />
                  </label>
                )}
              </div>

              <div className="space-y-3 rounded-2xl border border-black/[0.07] bg-[#f8fafb] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Related products</p>
                {initial ? (
                  <>
                    <div className="relative">
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            void linkProduct(e.target.value);
                            e.target.value = "";
                          }
                        }}
                        className="admin-input admin-select"
                      >
                        <option value="">Link a product...</option>
                        {availableProducts.map((product) => (
                          <option key={product.id} value={product.id}>{product.name}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-black/40" aria-hidden="true" />
                    </div>
                    {relatedProducts.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {relatedProducts.map((product) => (
                          <span key={product.productId} className="inline-flex items-center gap-2 rounded-xl border border-black/[0.07] bg-white px-3 py-2 text-xs font-semibold">
                            {product.name}
                            <button type="button" onClick={() => unlinkProduct(product.productId)} className="text-black/40 hover:text-red-700">
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-black/45">Save the article first, then link products.</p>
                )}
              </div>

              <div className="space-y-3 rounded-2xl border border-black/[0.07] bg-[#f8fafb] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">SEO</p>
                <label className="block text-sm font-semibold text-black/70">
                  SEO title
                  <input
                    value={form.seoTitle}
                    onChange={(e) => setForm((current) => ({ ...current, seoTitle: e.target.value }))}
                    className="admin-input mt-2"
                  />
                </label>
                <label className="block text-sm font-semibold text-black/70">
                  SEO description
                  <textarea
                    value={form.seoDescription}
                    onChange={(e) => setForm((current) => ({ ...current, seoDescription: e.target.value }))}
                    className="admin-input mt-2 min-h-[3rem] py-3"
                    rows={2}
                  />
                </label>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function AuthorsTab() {
  const [authors, setAuthors] = useState<ContentAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ContentAuthor | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/content-authors");
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.message || "Authors could not be loaded.");
      setAuthors(normalizeAuthors(json.authors));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authors could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function handleDelete(author: ContentAuthor) {
    if (!window.confirm(`Delete ${author.name}?`)) return;
    const response = await fetch(`/api/admin/content-authors/${author.id}`, { method: "DELETE" });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setError(json.message || "Author could not be deleted.");
      return;
    }
    await load();
  }

  const columns: AdminTableColumn<ContentAuthor>[] = [
    {
      key: "name",
      header: "Author",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-[#f3f5f7] text-black/40">
            {row.avatarUrl ? <Image src={row.avatarUrl} alt="" fill sizes="40px" className="object-cover" /> : <User size={18} />}
          </span>
          <span className="font-medium">{row.name}</span>
        </div>
      ),
    },
    { key: "bio", header: "Bio", cell: (row) => <span className="line-clamp-1 text-black/50">{row.bio || "—"}</span> },
    { key: "active", header: "Active", cell: (row) => (row.isActive ? "Yes" : "No") },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton label="Edit author" onClick={() => { setEditing(row); setShowForm(true); }}><Edit3 size={14} /></IconButton>
          <IconButton label="Delete author" onClick={() => handleDelete(row)}><Trash2 size={14} /></IconButton>
        </div>
      ),
    },
  ];

  if (error) return <AdminErrorState description={error} onRetry={() => void load()} />;
  if (loading) return <LoadingState />;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-black/55">{authors.length} author(s)</p>
        <button type="button" onClick={() => { setEditing(null); setShowForm(true); }} className="admin-button px-4 py-2 text-sm">
          <Plus size={16} /> New author
        </button>
      </div>

      {authors.length === 0 ? (
        <AdminEmptyState
          title="No authors"
          description="Add authors so articles can be attributed."
          icon={<PenTool size={24} />}
        />
      ) : (
        <AdminDataTable rows={authors} columns={columns} rowKey={(row) => row.id} caption="Content authors" />
      )}

      <AuthorFormModal open={showForm} onClose={() => setShowForm(false)} initial={editing} onSaved={load} />
    </section>
  );
}

function AuthorFormModal({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: ContentAuthor | null;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name);
      setBio(initial.bio);
      setAvatarUrl(initial.avatarUrl);
      setIsActive(initial.isActive);
    } else {
      setName("");
      setBio("");
      setAvatarUrl("");
      setIsActive(true);
    }
    setError("");
  }, [open, initial]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { name, bio, avatarUrl, isActive };
      const response = await fetch(
        initial ? `/api/admin/content-authors/${initial.id}` : "/api/admin/content-authors",
        {
          method: initial ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.message || "Author could not be saved.");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save author.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal open={open} onClose={onClose} title={initial ? "Edit author" : "New author"} subtitle="Author">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <label className="block text-sm font-semibold text-black/70">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} className="admin-input mt-2" required />
        </label>
        <label className="block text-sm font-semibold text-black/70">
          Bio
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} className="admin-input mt-2 min-h-[4rem] py-3" rows={3} />
        </label>
        <label className="block text-sm font-semibold text-black/70">
          Avatar URL
          <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} className="admin-input mt-2" type="url" />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-black/70">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-[#28637d]" />
          Active
        </label>
        <button type="submit" disabled={saving} className="admin-button h-12 w-full">
          <Save size={18} /> {saving ? "Saving…" : initial ? "Update author" : "Create author"}
        </button>
      </form>
    </AdminModal>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-xl text-black/45 transition hover:bg-black/[0.06] hover:text-black"
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: ContentStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusColors[status]}`}>
      {status}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="space-y-2">
      {[...Array(4)].map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-2xl bg-black/[0.04]" />
      ))}
    </div>
  );
}

function normalizePosts(value: unknown): ContentPost[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as Record<string, unknown>;
    const body = (row.body as ContentPost["body"]) || emptyBody;
    return {
      id: String(row.id || ""),
      authorId: row.authorId ? String(row.authorId) : null,
      slug: String(row.slug || ""),
      title: String(row.title || ""),
      excerpt: String(row.excerpt || ""),
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
      heroImageUrl: String(row.heroImageUrl || row.hero_image_url || ""),
      imageAlt: String(row.imageAlt || row.image_alt || ""),
      status: String(row.status || "draft") as ContentStatus,
      seoTitle: String(row.seoTitle || row.seo_title || ""),
      seoDescription: String(row.seoDescription || row.seo_description || ""),
      publishedAt: row.publishedAt ? String(row.publishedAt) : row.published_at ? String(row.published_at) : null,
      scheduledFor: row.scheduledFor ? String(row.scheduledFor) : row.scheduled_for ? String(row.scheduled_for) : null,
      category: String(row.category || "Parenting"),
      minutes: Number(row.minutes || 5),
      ctaLabel: row.ctaLabel ? String(row.ctaLabel) : row.cta_label ? String(row.cta_label) : null,
      ctaHref: row.ctaHref ? String(row.ctaHref) : row.cta_href ? String(row.cta_href) : null,
      createdAt: String(row.createdAt || row.created_at || ""),
      updatedAt: String(row.updatedAt || row.updated_at || ""),
    };
  }).filter((post) => post.id);
}

function normalizeAuthors(value: unknown): ContentAuthor[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: String(row.id || ""),
      name: String(row.name || ""),
      bio: String(row.bio || ""),
      avatarUrl: String(row.avatarUrl || row.avatar_url || ""),
      isActive: "isActive" in row ? Boolean(row.isActive) : "is_active" in row ? Boolean(row.is_active) : true,
      createdAt: String(row.createdAt || row.created_at || ""),
    };
  }).filter((author) => author.id);
}

function normalizeProducts(value: unknown): CatalogProduct[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: String(row.id || ""),
      name: String(row.name || "Product"),
      sku: String(row.sku || ""),
      imageUrl: String(row.imageUrl || row.image_url || ""),
      active: Boolean(row.active ?? row.is_active ?? true),
    };
  }).filter((product) => product.id);
}
