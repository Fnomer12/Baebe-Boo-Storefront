import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, RotateCcw, ShieldCheck, Star, Truck } from "lucide-react";
import ProductActions from "@/components/storefront/ProductActions";
import ProductGallery from "@/components/storefront/ProductGallery";
import ProductRecommendations from "@/components/storefront/ProductRecommendations";
import ConversionPrompts from "@/components/storefront/ConversionPrompts";
import { StorefrontPage } from "@/components/storefront/StorefrontChrome";
import { demoCatalogEnabled, formatPrice, productPriceLabel, type StorefrontProduct } from "@/components/storefront/catalog-data";
import { loadFrequentlyBoughtTogether, loadStorefrontProduct } from "@/lib/storefront-product";

const assurances = [
  { icon: Truck, text: "Nationwide delivery" },
  { icon: RotateCcw, text: "Easy returns" },
  { icon: ShieldCheck, text: "Authentic products" },
];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { product, found } = await loadStorefrontProduct(slug);
  if (!found && !demoCatalogEnabled) return { title: "Product not found" };
  return { title: `${product.name}`, description: product.description };
}

function Stars({ rating, size = 15 }: { rating: number; size?: number }) {
  return (
    <span className="flex gap-0.5 text-[#cc9153]">
      {[1, 2, 3, 4, 5].map((position) => (
        <Star key={position} size={size} fill="currentColor" opacity={position > rating ? 0.22 : 1} />
      ))}
    </span>
  );
}

/**
 * Detail rows shown under the buy box. Options with a single value are listed
 * here rather than rendered as a one-button picker, and repeated labels or
 * values (live products already carry an "Age" spec) are collapsed.
 */
function detailRows(product: StorefrontProduct) {
  const rows = [
    ...product.specifications,
    ...product.options
      .filter((option) => option.values.length === 1)
      .map((option) => ({ label: option.name, value: option.values[0] })),
    { label: "Age suitability", value: product.age },
  ];
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { product, reviews, found } = await loadStorefrontProduct(slug);
  if (!found && !demoCatalogEnabled) notFound();
  const frequentlyBought = found ? await loadFrequentlyBoughtTogether(product.id) : [];
  const reviewAverage = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : null;
  const details = detailRows(product);

  return (
    <StorefrontPage showReadinessBanner>
      <div className="storefront-shell pb-20 pt-28 sm:pt-32">
        <nav aria-label="Breadcrumb" className="mb-7 flex items-center gap-2 text-xs text-black/45">
          <Link href="/store" className="hover:text-black">Shop</Link>
          <span aria-hidden>/</span>
          <Link href={`/category/${product.categorySlug}`} className="hover:text-black">{product.category}</Link>
        </nav>

        <div className="storefront-product-detail">
          <ProductGallery product={product} />
          <div className="storefront-product-summary py-3 lg:px-6">
            {(product.badge || product.category) && <p className="storefront-eyebrow">{product.badge || product.category}</p>}
            <h1>{product.name}</h1>

            <div className="mt-4 flex flex-wrap items-baseline gap-3">
              {/* A product whose versions differ in price leads with the span;
                  ProductActions shows the exact price of the chosen one. */}
              <strong className="text-3xl">{productPriceLabel(product)}</strong>
              {product.compareAtPrice && product.compareAtPrice > product.price && (
                <span className="text-black/35 line-through">{formatPrice(product.compareAtPrice)}</span>
              )}
            </div>

            {reviewAverage !== null && (
              <a href="#reviews" className="mt-3 flex items-center gap-2 text-sm text-black/55 hover:text-black">
                <Stars rating={reviewAverage} />
                {reviewAverage.toFixed(1)} · {reviews.length} verified review{reviews.length === 1 ? "" : "s"}
              </a>
            )}

            <p className="mb-7 mt-5 leading-7 text-black/60">{product.description}</p>

            <ProductActions product={product} />

            {details.length > 0 && (
              <dl className="storefront-product-facts">
                {details.map((row) => (
                  // Keyed on both: an option and a specification may share a label.
                  <div key={`${row.label}-${row.value}`}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-6 grid gap-3 border-t border-black/10 pt-5 sm:grid-cols-3">
              {assurances.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-xs font-semibold">
                  <Icon size={17} />{text}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Nothing stands in for reviews that do not exist — the section is simply absent. */}
        {reviews.length > 0 && (
          <section id="reviews" className="mt-16 scroll-mt-28">
            <p className="storefront-eyebrow">Reviews</p>
            <h2 className="text-3xl font-semibold">What families said</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {reviews.map((review) => (
                <article key={review.id} className="rounded-3xl bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <Stars rating={review.rating} size={14} />
                    {review.verified && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-[#396347]">
                        <BadgeCheck size={15} /> Verified purchase
                      </span>
                    )}
                  </div>
                  {review.title && <h3 className="mt-4 font-semibold">{review.title}</h3>}
                  {review.body && <p className="mt-2 leading-7 text-black/60">{review.body}</p>}
                </article>
              ))}
            </div>
          </section>
        )}

        <ProductRecommendations current={product} frequentlyBought={frequentlyBought} />
      </div>
      <ConversionPrompts />
    </StorefrontPage>
  );
}
