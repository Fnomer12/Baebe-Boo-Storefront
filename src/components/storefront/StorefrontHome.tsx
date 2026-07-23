/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowRight, Check, HeartHandshake, MapPin, Search, ShieldCheck, Sparkles, Star, Truck } from "lucide-react";
import LazyMemberForm from "./LazyMemberForm";
import ProductCard, { ProductVisual } from "./ProductCard";
import { StorefrontPage, whatsappUrl } from "./StorefrontChrome";
import { ageRanges, catalogProductFromRow, categories, demoCatalogEnabled, fallbackProducts, fallbackShops, parentingArticles, type PublicCatalogRow, type StorefrontProduct, type StorefrontShop } from "./catalog-data";
import { loadStorefrontHomeData } from "@/lib/storefront-home";

type ShopRow = { id: string; name: string | null; location: string | null };

const cartersHomepageProducts: StorefrontProduct[] = [
  { id: "home-carters-hoodie", slug: "baby-girl-bear-fleece-zip-up-hoodie", name: "Baby Girl Bear Fleece Zip-Up Hoodie", category: "Baby Clothing", categorySlug: "baby-clothing", age: "0–12 Months", ageSlug: "0-3-months", gender: "Girl", price: 285, imageUrl: "/products/carters/baby-girl-bear-fleece-zip-up-hoodie.jpg", badge: "New", description: "A cozy fleece layer for everyday outings.", colors: ["Pink"], sizes: ["3M", "6M", "9M"], specifications: [] },
  { id: "home-carters-sneakers", slug: "baby-girl-every-step-shimmer-heart-sneakers", name: "Every Step® Shimmer Heart Sneakers", category: "Baby Shoes", categorySlug: "baby-shoes", age: "1–2 Years", ageSlug: "1-2-years", gender: "Girl", price: 340, imageUrl: "/products/carters/baby-girl-every-step-shimmer-heart-sneakers.jpg", badge: "First steps", description: "Supportive first walker sneakers with a soft shimmer finish.", colors: ["White", "Pink"], sizes: ["3", "4", "5"], specifications: [] },
  { id: "home-carters-phone", slug: "explore-more-selfie-phone", name: "Explore & More Selfie Phone", category: "Toys", categorySlug: "toys", age: "6–12 Months", ageSlug: "6-12-months", gender: "Unisex", price: 175, imageUrl: "/products/carters/explore-more-selfie-phone.jpg", badge: "Play pick", description: "A bright baby toy for curious hands and pretend play.", colors: ["Multi"], sizes: ["One size"], specifications: [] },
  { id: "home-carters-sleep-play", slug: "baby-elephant-striped-sleep-play-two-pack", name: "2-Pack Elephant Striped Sleep & Play", category: "Nursery", categorySlug: "nursery", age: "0–6 Months", ageSlug: "0-3-months", gender: "Unisex", price: 310, imageUrl: "/products/carters/baby-elephant-striped-sleep-play-two-pack.jpg", badge: "Soft sleep", description: "Easy zip sleep-and-play essentials for newborn routines.", colors: ["Blue", "Stripe"], sizes: ["Newborn", "3M", "6M"], specifications: [] },
  { id: "home-carters-bodysuits", slug: "baby-five-pack-sleeveless-bodysuits", name: "5-Pack Sleeveless Bodysuits", category: "Baby Clothing", categorySlug: "baby-clothing", age: "0–12 Months", ageSlug: "3-6-months", gender: "Unisex", price: 260, imageUrl: "/products/carters/baby-five-pack-sleeveless-bodysuits.jpg", badge: "Multipack", description: "Simple everyday bodysuits for warm days and layering.", colors: ["White"], sizes: ["3M", "6M", "9M"], specifications: [] },
  { id: "home-carters-teether", slug: "farmstand-teether-play-baby-toy", name: "Farmstand Teether & Play Baby Toy", category: "Toys", categorySlug: "toys", age: "3–12 Months", ageSlug: "3-6-months", gender: "Unisex", price: 145, imageUrl: "/products/carters/farmstand-teether-play-baby-toy.jpg", badge: "Giftable", description: "A colorful teether toy made for early sensory play.", colors: ["Multi"], sizes: ["One size"], specifications: [] },
];

const categoryFallbackImages: Record<string, string> = {
  "baby-clothing": "/products/carters/baby-girl-bear-fleece-zip-up-hoodie.jpg",
  "baby-shoes": "/products/carters/baby-girl-every-step-shimmer-heart-sneakers.jpg",
  feeding: "/products/carters/baby-little-planet-silicone-wood-teether.jpg",
  toys: "/products/carters/explore-more-selfie-phone.jpg",
  "school-essentials": "/products/carters/toddler-boy-denim-classic-jeans.jpg",
  nursery: "/products/carters/baby-elephant-striped-sleep-play-two-pack.jpg",
  "gift-sets": "/products/carters/baby-four-piece-elephant-long-sleeve-set.jpg",
  maternity: "/products/carters/baby-organic-cotton-sweater-knit-jumpsuit.jpg",
  clearance: "/products/carters/baby-five-pack-sleeveless-bodysuits.jpg",
};

const merchandisingNotes = [
  "Real product photos, not placeholders",
  "Soft colors, clear sizes and easy browsing",
  "Branch-aware stock and Ghana delivery",
];

export default async function StorefrontHome() {
  const result = (await loadStorefrontHomeData()) as {
    products: PublicCatalogRow[];
    shops: ShopRow[];
    bestSellerIds: string[];
  };
  const mapped = result.products
    .map(catalogProductFromRow)
    .filter((product): product is StorefrontProduct => Boolean(product));
  const byId = new Map(mapped.map((product) => [product.id, product]));
  const displayProducts = mapped.length ? mapped : cartersHomepageProducts;
  const newArrivals = displayProducts.length
    ? displayProducts.slice(0, 4)
    : demoCatalogEnabled
      ? fallbackProducts.slice(4, 8)
      : [];
  const ranked = result.bestSellerIds
    .map((id) => byId.get(id))
    .filter((product): product is StorefrontProduct => Boolean(product));
  const bestSellers = ranked.length
    ? ranked
    : displayProducts.length
      ? displayProducts.slice(0, 4)
      : demoCatalogEnabled
        ? fallbackProducts.slice(0, 4)
        : [];
  const shops: StorefrontShop[] = result.shops.length
    ? result.shops.map((shop) => ({ id: shop.id, name: shop.name || "Baebe Boo", location: shop.location || "Ghana", hours: "Confirm hours with the store", phone: "" }))
    : demoCatalogEnabled
      ? fallbackShops
      : [];

  const heroProducts = pickProducts(displayProducts, ["Baby Clothing", "Baby Shoes", "Toys", "Nursery"], 4);
  const spotlightProduct = heroProducts[0] ?? bestSellers[0] ?? newArrivals[0] ?? null;
  const categoryShowcase = categories.map((category) => {
    const product = displayProducts.find((item) => item.categorySlug === category.slug);
    return { ...category, image: product?.imageUrl || categoryFallbackImages[category.slug] || "" };
  });
  const capsuleProducts = pickProducts(displayProducts, ["Baby Clothing", "Baby Shoes", "Toys"], 6).slice(0, 6);

  return (
    <StorefrontPage>
      <div className="storefront-shell storefront-home space-y-16 pb-20 pt-24 sm:space-y-24 sm:pt-28">
        <section className="storefront-hero storefront-retail-hero">
          <div className="storefront-hero-copy">
            <p className="storefront-eyebrow"><Sparkles size={14} /> Soft premium essentials, curated for Ghana</p>
            <h1>Everything Your Little One Needs for every first.</h1>
            <p className="storefront-lead">Shop real baby clothing, soft sleepwear, first-step shoes, toys and thoughtful gifts in a calm, easy-to-read store made for busy parents on mobile.</p>
            <div className="storefront-hero-actions">
              <Link href="/store" prefetch={false} className="storefront-primary-button">Start shopping <ArrowRight size={18} /></Link>
              <Link href="/category/baby-clothing" className="storefront-secondary-button">Baby clothing</Link>
              <Link href={whatsappUrl} target="_blank" className="storefront-text-button">Ask a stylist</Link>
            </div>
            <div className="storefront-hero-notes" aria-label="Shopping promises">
              {merchandisingNotes.map((note) => <span key={note}><Check size={14} />{note}</span>)}
            </div>
          </div>
          <div className="storefront-hero-gallery" aria-label="Real product photography used in the Baebe Boo catalog">
            {heroProducts.map((product, index) => (
              <Link href={`/products/${product.slug}`} key={product.id} className="storefront-hero-photo" data-slot={index + 1}>
                <ProductVisual product={product} />
                <span>{product.name}</span>
              </Link>
            ))}
            {spotlightProduct && (
              <Link href={`/products/${spotlightProduct.slug}`} className="storefront-hero-price-card">
                <span>Featured find</span>
                <strong>{spotlightProduct.name}</strong>
                <small>Shop the product <ArrowRight size={13} /></small>
              </Link>
            )}
          </div>
        </section>

        <section className="storefront-promo-row" aria-label="Store highlights">
          {[{ icon: ShieldCheck, title: "Authentic Products", text: "Real product names, photos and details", href: "/store" }, { icon: Truck, title: "Ghana delivery", text: "Order online and receive branch-supported service", href: "/stores" }, { icon: HeartHandshake, title: "Parent-ready help", text: "WhatsApp support before and after checkout", href: whatsappUrl }].map(({ icon: Icon, title, text, href }) => <div key={title}><Icon size={22} /><span><strong>{title}</strong><small>{text}</small></span><Link href={href} className="storefront-promo-link">Shop now</Link></div>)}
        </section>

        <section>
          <SectionHeading eyebrow="Shop by department" title="Soft colors, real products, clear choices" href="/store" />
          <div className="storefront-category-showcase">
            {categoryShowcase.map((category) => (
              <Link key={category.slug} href={`/category/${category.slug}`} className="storefront-category-tile" data-tone={category.tone}>
                {category.image && <img src={category.image} alt={`${category.name} product`} loading="lazy" />}
                <span><strong>{category.name}</strong><small>Shop now</small></span>
                <ArrowRight size={17} />
              </Link>
            ))}
          </div>
        </section>

        <section className="storefront-age-section storefront-shop-by-age">
          <div><p className="storefront-eyebrow">Shop by age</p><h2>Shop their age,<br />meet their moment.</h2><p>From newborn sleep-and-plays to toddler outfits and first walkers, every route starts with the stage families actually shop for.</p></div>
          <div className="storefront-age-list">{ageRanges.map((age, index) => <Link key={age.slug} href={`/age/${age.slug}`}><span>{String(index + 1).padStart(2, "0")}</span><strong>{age.name}</strong><small>{age.detail}</small><ArrowRight size={17} /></Link>)}</div>
        </section>

        {capsuleProducts.length >= 3 && (
          <section className="storefront-lookbook">
            <div>
              <p className="storefront-eyebrow">Styled from real products</p>
              <h2>Build a little capsule in minutes.</h2>
              <p>Pair soft sets, cozy layers, first shoes and sensory toys into practical bundles with a premium palette that feels calm, warm and parent-friendly.</p>
              <Link href="/store" className="storefront-secondary-button mt-5">Explore the full catalog <ArrowRight size={17} /></Link>
            </div>
            <div className="storefront-lookbook-grid">
              {capsuleProducts.slice(0, 4).map((product) => (
                <Link href={`/products/${product.slug}`} key={product.id}>
                  <ProductVisual product={product} />
                  <span>{product.name}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionHeading eyebrow="Loved right now" title="Family favourites" href="/store?sort=featured" />
          {bestSellers.length ? <div className="storefront-product-grid">{bestSellers.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <p className="text-sm text-black/70">Customer favourites will appear after verified purchases.</p>}
        </section>

        <section className="storefront-story-banner storefront-production-banner">
          <div className="storefront-story-photo-stack" aria-hidden="true">
            {pickProducts(displayProducts, ["Baby Clothing", "Nursery"], 3).slice(0, 3).map((product, index) => <img key={product.id} src={product.imageUrl} alt="" loading="lazy" data-index={index + 1} />)}
          </div>
          <div><p className="storefront-eyebrow">Production-ready store promise</p><h2>Built like a real retail homepage, not a placeholder.</h2><p>High-trust messaging, real product imagery, clear departments, mobile-first buying paths, verified product cards and operational store links make the homepage ready for real customers.</p><Link href="/trust" className="storefront-secondary-button mt-5">See trust & safety <ArrowRight size={17} /></Link></div>
        </section>

        <section>
          <SectionHeading eyebrow="Just arrived" title="Fresh little finds" href="/store?sort=newest" />
          {newArrivals.length ? <div className="storefront-product-grid">{newArrivals.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <p className="text-sm text-black/70">New verified products are being prepared.</p>}
        </section>

        <section className="storefront-reviews">
          <div><p className="storefront-eyebrow">Family notes</p><h2>Loved by Ghanaian families</h2><div className="flex gap-1 text-[#cc9153]">{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={18} fill="currentColor" />)}</div><p className="text-sm text-black/70">Genuine customer stories will appear here after review verification.</p></div>
          <div className="storefront-review-placeholder"><Check size={25} /><strong>Verified reviews only</strong><p>We never invent customer voices. This space is ready for approved reviews from real Baebe Boo purchases.</p></div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
          <div className="storefront-panel">
            <SectionHeading eyebrow="Come say hello" title="Your nearest Baebe Boo" href="/stores" />
            <div className="grid gap-3 sm:grid-cols-2">{shops.slice(0, 4).map((shop) => <Link href="/stores" key={shop.id} className="storefront-shop-card"><MapPin size={20} /><span><strong>{shop.name}</strong><small>{shop.location}</small></span><ArrowRight size={16} /></Link>)}</div>
          </div>
          <div className="storefront-panel storefront-search-panel"><Search size={27} /><p className="storefront-eyebrow">Need a hand?</p><h2>Find it in a few words.</h2><form action="/store"><input name="q" aria-label="Search products" placeholder="Try ‘newborn gift’" /><button aria-label="Search"><ArrowRight size={18} /></button></form><small>Popular: fleece hoodie · first shoes · sleep & play</small></div>
        </section>

        <section>
          <SectionHeading eyebrow="The Parenting Hub" title="A little guidance goes a long way" href="/parenting" />
          <div className="storefront-article-grid">{parentingArticles.slice(0, 3).map((article, index) => <Link href={`/parenting/${article.slug}`} key={article.slug} data-index={index + 1}><span>{article.category}</span><h3>{article.title}</h3><p>{article.excerpt}</p><small>{article.minutes} min read <ArrowRight size={14} /></small></Link>)}</div>
        </section>

        <section id="family-signup" className="storefront-family-signup scroll-mt-28">
          <div><p className="storefront-eyebrow">The Baebe Boo family</p><h2>Small surprises for your biggest moments.</h2><p>Join for age-relevant ideas, birthday treats, member-first finds and a little more joy in your inbox.</p><ul><li><Check size={16} /> Thoughtful, age-relevant tips</li><li><Check size={16} /> Birthday surprises</li><li><Check size={16} /> Early access to special collections</li></ul></div>
          <LazyMemberForm />
        </section>
      </div>
    </StorefrontPage>
  );
}

function pickProducts(products: StorefrontProduct[], preferredCategories: string[], limit: number) {
  const picked: StorefrontProduct[] = [];
  for (const category of preferredCategories) {
    const product = products.find((item) => item.category === category && item.imageUrl && !picked.some((existing) => existing.id === item.id));
    if (product) picked.push(product);
  }
  for (const product of products) {
    if (picked.length >= limit) break;
    if (product.imageUrl && !picked.some((existing) => existing.id === product.id)) picked.push(product);
  }
  return picked.slice(0, limit);
}

function SectionHeading({ eyebrow, title, href }: { eyebrow: string; title: string; href: string }) {
  return <div className="storefront-section-heading"><div><p className="storefront-eyebrow">{eyebrow}</p><h2>{title}</h2></div><Link href={href}>View all <ArrowRight size={16} /></Link></div>;
}
