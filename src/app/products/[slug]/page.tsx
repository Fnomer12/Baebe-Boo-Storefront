import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Check, RotateCcw, ShieldCheck, Star, Truck } from "lucide-react";
import ProductActions from "@/components/storefront/ProductActions";
import ProductGallery from "@/components/storefront/ProductGallery";
import ProductRecommendations from "@/components/storefront/ProductRecommendations";
import ConversionPrompts from "@/components/storefront/ConversionPrompts";
import { StorefrontPage } from "@/components/storefront/StorefrontChrome";
import { formatPrice } from "@/components/storefront/catalog-data";
import { loadStorefrontProduct } from "@/lib/storefront-product";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { product } = await loadStorefrontProduct(slug);
  return { title: `${product.name} | Baebe Boo`, description: product.description };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { product, reviews } = await loadStorefrontProduct(slug);
  const reviewAverage = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : null;

  return (
    <StorefrontPage>
      <div className="storefront-shell pb-20 pt-28 sm:pt-32">
        <nav aria-label="Breadcrumb" className="mb-7 text-xs text-black/45"><Link href="/store">Shop</Link> <span className="px-2">/</span> <Link href={`/category/${product.categorySlug}`}>{product.category}</Link> <span className="px-2">/</span> <span>{product.name}</span></nav>
        <div className="storefront-product-detail">
          <ProductGallery product={product} />
          <div className="py-3 lg:px-6">
            <p className="storefront-eyebrow">{product.badge || product.category}</p>
            <h1>{product.name}</h1>
            <div className="my-4 flex items-center gap-3"><strong className="text-2xl">{formatPrice(product.price)}</strong>{product.compareAtPrice && <span className="text-black/35 line-through">{formatPrice(product.compareAtPrice)}</span>}</div>
            <div className="mb-5 flex items-center gap-2 text-sm"><span className="flex gap-0.5 text-[#cc9153]">{[1,2,3,4,5].map((item) => <Star key={item} size={15} fill="currentColor" opacity={reviewAverage && item > reviewAverage ? 0.25 : 1} />)}</span><span className="text-black/45">{reviews.length ? `${reviewAverage?.toFixed(1)} from ${reviews.length} verified review${reviews.length === 1 ? "" : "s"}` : "Be the first verified buyer to review"}</span></div>
            <p className="mb-7 leading-7 text-black/60">{product.description}</p>
            <ProductActions product={product} />
            <div className="mt-8 grid gap-3 border-t border-black/10 pt-6 sm:grid-cols-3">{[{ icon: Truck, text: "Nationwide delivery" }, { icon: RotateCcw, text: "Easy returns" }, { icon: ShieldCheck, text: "Authentic products" }].map(({ icon: Icon, text }) => <div key={text} className="flex items-center gap-2 text-xs font-semibold"><Icon size={17} />{text}</div>)}</div>
          </div>
        </div>
        <section className="storefront-details-panel"><div><p className="storefront-eyebrow">The details</p><h2>Made for everyday little moments</h2><p>{product.description}</p></div><dl>{product.specifications.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}<div><dt>Age suitability</dt><dd>{product.age}</dd></div></dl></section>
        {reviews.length ? (
          <section className="mt-16"><p className="storefront-eyebrow">Reviews from real families</p><h2 className="mt-3 text-3xl font-semibold">Verified purchase stories</h2><div className="mt-6 grid gap-4 md:grid-cols-2">{reviews.map((review) => <article key={review.id} className="rounded-3xl bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-3"><span className="flex gap-0.5 text-[#cc9153]">{Array.from({ length: review.rating }, (_, index) => <Star key={index} size={14} fill="currentColor" />)}</span>{review.verified && <span className="flex items-center gap-1 text-xs font-semibold text-[#396347]"><BadgeCheck size={15} /> Verified purchase</span>}</div>{review.title && <h3 className="mt-4 font-semibold">{review.title}</h3>}{review.body && <p className="mt-2 leading-7 text-black/60">{review.body}</p>}</article>)}</div></section>
        ) : (
          <section className="storefront-review-block"><Check size={24} /><div><h2>Reviews from real families</h2><p>Only verified-purchase reviews will appear here. No placeholders are presented as customer endorsements.</p></div></section>
        )}
        <ProductRecommendations current={product} />
      </div>
      <ConversionPrompts />
    </StorefrontPage>
  );
}
