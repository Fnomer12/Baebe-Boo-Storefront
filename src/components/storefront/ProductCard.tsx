import Link from "next/link";
import { ArrowUpRight, Baby } from "lucide-react";
import { formatPrice, productPriceLabel, productPriceRange, type StorefrontProduct } from "./catalog-data";
import SaveButton from "./SaveButton";

export function ProductVisual({ product, className = "" }: { product: StorefrontProduct; className?: string }) {
  return (
    <div className={`storefront-product-visual ${className}`}>
      {product.imageUrl ? (
        // Supabase-hosted catalog images are dynamic and constrained by the site's CSP.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
      ) : (
        <>
          <span className="storefront-orb storefront-orb-one" />
          <span className="storefront-orb storefront-orb-two" />
          <div className="storefront-product-mark" aria-hidden="true">
            <Baby size={34} strokeWidth={1.5} />
          </div>
          <span className="storefront-product-category">{product.category}</span>
        </>
      )}
    </div>
  );
}

export default function ProductCard({ product }: { product: StorefrontProduct }) {
  // `product.price` is the cheapest live version, not "the price". A product
  // sold at GH₵89 and GH₵189 must advertise "From GH₵89.00" or the card is a
  // promise the product page immediately breaks.
  const { from, to } = productPriceRange(product);
  const oneVersionPrice = from === to;
  return (
    <article className="group min-w-0">
      <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-white shadow-[var(--shadow-sm)] transition duration-300 group-hover:shadow-[var(--shadow-md)]">
        <Link href={`/products/${product.slug}`} aria-label={`View ${product.name}`}>
          <ProductVisual product={product} className="aspect-[4/4.5] transition duration-500 group-hover:scale-[1.02]" />
        </Link>
        <SaveButton product={product} />
        {product.badge && <span className="absolute left-3 top-3 rounded-full bg-[#fffdf8]/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] backdrop-blur">{product.badge}</span>}
      </div>
      <div className="px-1 pb-2 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/category/${product.categorySlug}`} className="text-[10px] font-bold uppercase tracking-[0.16em] text-black/40">{product.category}</Link>
            <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-5"><Link href={`/products/${product.slug}`}>{product.name}</Link></h3>
          </div>
          <Link href={`/products/${product.slug}`} aria-label={`Open ${product.name}`} className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/10 transition hover:border-black hover:bg-black hover:text-white"><ArrowUpRight size={15} /></Link>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="font-semibold">{productPriceLabel(product)}</span>
          {/* A "was" price only means something next to a single "now" price —
              struck through beside "From GH₵89.00" it reads as a saving nobody offered. */}
          {oneVersionPrice && product.compareAtPrice && <span className="text-xs text-black/35 line-through">{formatPrice(product.compareAtPrice)}</span>}
        </div>
      </div>
    </article>
  );
}
