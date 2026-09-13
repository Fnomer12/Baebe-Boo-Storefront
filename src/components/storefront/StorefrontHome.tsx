/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowRight, Check, HeartHandshake, MapPin, MessageCircle, Search, ShieldCheck, Sparkles, Truck } from "lucide-react";
import LazyMemberForm from "./LazyMemberForm";
import ProductCard from "./ProductCard";
import AgeCarousel from "./AgeCarousel";
import InstantSearch from "./InstantSearch";
import { StorefrontPage, whatsappUrl } from "./StorefrontChrome";
import { catalogProductFromRow, categories, demoCatalogEnabled, fallbackShops, parentingArticles, type PublicCatalogRow, type StorefrontProduct, type StorefrontShop } from "./catalog-data";
import { loadStorefrontHomeData } from "@/lib/storefront-home";

type ShopRow = { id: string; name: string | null; location: string | null; whatsapp_number: string | null };

const cartersHomepageProducts: StorefrontProduct[] = [
  { id: "home-carters-hoodie", slug: "baby-girl-bear-fleece-zip-up-hoodie", name: "Baby Girl Bear Fleece Zip-Up Hoodie", category: "Baby Clothing", categorySlug: "baby-clothing", age: "0–12 Months", ageSlug: "0-3-months", gender: "Girl", price: 285, imageUrl: "/products/carters/baby-girl-bear-fleece-zip-up-hoodie.jpg", badge: "New", description: "A cozy fleece layer for everyday outings.", options: [{ name: "Colour", values: ["Pink"] }, { name: "Size", values: ["3M", "6M", "9M"] }], specifications: [] },
  { id: "home-carters-sneakers", slug: "baby-girl-every-step-shimmer-heart-sneakers", name: "Every Step® Shimmer Heart Sneakers", category: "Baby Shoes", categorySlug: "baby-shoes", age: "1–2 Years", ageSlug: "1-2-years", gender: "Girl", price: 340, imageUrl: "/products/carters/baby-girl-every-step-shimmer-heart-sneakers.jpg", badge: "First steps", description: "Supportive first walker sneakers with a soft shimmer finish.", options: [{ name: "Colour", values: ["White", "Pink"] }, { name: "Size", values: ["3", "4", "5"] }], specifications: [] },
  { id: "home-carters-phone", slug: "explore-more-selfie-phone", name: "Explore & More Selfie Phone", category: "Toys", categorySlug: "toys", age: "6–12 Months", ageSlug: "6-12-months", gender: "Unisex", price: 175, imageUrl: "/products/carters/explore-more-selfie-phone.jpg", badge: "Play pick", description: "A bright baby toy for curious hands and pretend play.", options: [{ name: "Colour", values: ["Multi"] }, { name: "Size", values: ["One size"] }], specifications: [] },
  { id: "home-carters-sleep-play", slug: "baby-elephant-striped-sleep-play-two-pack", name: "2-Pack Elephant Striped Sleep & Play", category: "Nursery", categorySlug: "nursery", age: "0–6 Months", ageSlug: "0-3-months", gender: "Unisex", price: 310, imageUrl: "/products/carters/baby-elephant-striped-sleep-play-two-pack.jpg", badge: "Soft sleep", description: "Easy zip sleep-and-play essentials for newborn routines.", options: [{ name: "Colour", values: ["Blue", "Stripe"] }, { name: "Size", values: ["Newborn", "3M", "6M"] }], specifications: [] },
  { id: "home-carters-bodysuits", slug: "baby-five-pack-sleeveless-bodysuits", name: "5-Pack Sleeveless Bodysuits", category: "Baby Clothing", categorySlug: "baby-clothing", age: "0–12 Months", ageSlug: "3-6-months", gender: "Unisex", price: 260, imageUrl: "/products/carters/baby-five-pack-sleeveless-bodysuits.jpg", badge: "Multipack", description: "Simple everyday bodysuits for warm days and layering.", options: [{ name: "Colour", values: ["White"] }, { name: "Size", values: ["3M", "6M", "9M"] }], specifications: [] },
  { id: "home-carters-teether", slug: "farmstand-teether-play-baby-toy", name: "Farmstand Teether & Play Baby Toy", category: "Toys", categorySlug: "toys", age: "3–12 Months", ageSlug: "3-6-months", gender: "Unisex", price: 145, imageUrl: "/products/carters/farmstand-teether-play-baby-toy.jpg", badge: "Giftable", description: "A colorful teether toy made for early sensory play.", options: [{ name: "Colour", values: ["Multi"] }, { name: "Size", values: ["One size"] }], specifications: [] },
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

// Hero layout to render: 1 = full-bleed image with overlaid text, 2 = full-bleed image with a floating text card.
const HERO_VARIANT: 1 | 2 = 1;

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
  const newArrivals = displayProducts.slice(0, 4);
  const newArrivalIds = new Set(newArrivals.map((product) => product.id));
  const ranked = result.bestSellerIds
    .map((id) => byId.get(id))
    .filter((product): product is StorefrontProduct => Boolean(product));
  // Admin-featured products take the "Family favourites" slots first (newest
  // first, the order the query returns), then verified best-sellers fill the
  // rest. Until either exists, curate a distinct, category-diverse selection
  // so the section does not simply mirror the newest four under
  // "Fresh little finds".
  const featured = result.products
    .filter((row) => row.is_featured === true)
    .map((row) => byId.get(row.id))
    .filter((product): product is StorefrontProduct => Boolean(product));
  const featuredIds = new Set(featured.map((product) => product.id));
  const withBestSellers = [
    ...featured,
    ...ranked.filter((product) => !featuredIds.has(product.id)),
  ].slice(0, 4);
  const bestSellers = withBestSellers.length
      ? withBestSellers
      : (() => {
        const remaining = displayProducts.filter((product) => !newArrivalIds.has(product.id));
        const curated = pickProducts(remaining, ["Baby Shoes", "Toys", "Nursery", "Gift Sets", "Feeding", "Baby Clothing"], 4);
        const curatedIds = new Set(curated.map((product) => product.id));
        const backfill = remaining.filter((product) => !curatedIds.has(product.id));
        return (curated.length >= 4 ? curated : [...curated, ...backfill]).slice(0, 4);
      })();
  const shops: StorefrontShop[] = result.shops.length
    ? result.shops.map((shop) => ({ id: shop.id, name: shop.name || "Baebe Boo", location: shop.location || "Ghana", hours: "Confirm hours with the store", phone: shop.whatsapp_number ? String(shop.whatsapp_number) : "", whatsapp: String(shop.whatsapp_number ?? "") }))
    : demoCatalogEnabled
      ? fallbackShops
      : [];

  const categoryShowcase = categories.map((category) => {
    const product = displayProducts.find((item) => item.categorySlug === category.slug);
    return { ...category, image: product?.imageUrl || categoryFallbackImages[category.slug] || "" };
  });

  return (
    <StorefrontPage showReadinessBanner={false}>
      <div className="storefront-shell storefront-home space-y-16 pb-20 pt-24 sm:space-y-24 sm:pt-28">
        <section className={`storefront-hero-banner storefront-hero-v${HERO_VARIANT}`}>
          <img className="storefront-hero-bg" src="/hero/mother-child.jpg" alt="A mother holding her baby close in a softly lit nursery" width={1792} height={1024} />
          <div className="storefront-hero-banner-inner">
            <div className={HERO_VARIANT === 2 ? "storefront-hero-copy storefront-hero-cardpanel" : "storefront-hero-copy"}>
              <p className="storefront-eyebrow"><Sparkles size={14} /> Soft premium essentials · Ghana</p>
              <h1>Everything Your Little One Needs, All In One <em>Trusted Place</em></h1>
              <p className="storefront-lead">Clothing, Shoes, Toys, Feeding Essentials, Nursery Items and Gifts Carefully Selected for Babies and Children.</p>
              <div className="storefront-hero-actions">
                <Link href="/store" prefetch={false} className="storefront-primary-button">Shop the collection <ArrowRight size={18} /></Link>
                <Link href="/category/baby-clothing" className="storefront-text-button">Browse baby clothing <ArrowRight size={16} /></Link>
              </div>
            </div>
          </div>
        </section>

        <section className="storefront-promo-row" aria-label="Store highlights">
          {[{ icon: ShieldCheck, title: "Authentic products", text: "Real photos and honest details on every item", href: "/store", cta: "Shop now" }, { icon: Truck, title: "Delivery across Ghana", text: "Order online with branch-supported service", href: "/stores", cta: "See stores" }, { icon: HeartHandshake, title: "Parent-ready help", text: "WhatsApp support before and after checkout", href: whatsappUrl, cta: "Chat now" }].map(({ icon: Icon, title, text, href, cta }) => <div key={title}><Icon size={22} /><span><strong>{title}</strong><small>{text}</small></span><Link href={href} className="storefront-promo-link">{cta}</Link></div>)}
        </section>

        <section>
          <SectionHeading eyebrow="Shop by department" title="Find everything, by category" href="/store" />
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
          <div className="storefront-age-intro"><p className="storefront-eyebrow">Shop by age</p><h2>Shop their age, meet their moment.</h2><p>From newborn sleep-and-plays to first-day-of-school essentials, every stage has its own little edit — chosen for the moment they are living right now.</p></div>
          <AgeCarousel />
        </section>

        <section>
          <SectionHeading eyebrow="Loved right now" title="Family favourites" href="/store?sort=featured" />
          {bestSellers.length ? <div className="storefront-product-grid">{bestSellers.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <p className="text-sm text-black/70">Customer favourites will appear after verified purchases.</p>}
        </section>

        <section className="storefront-story-banner storefront-production-banner">
          <div className="storefront-story-photos" aria-hidden="true">
            {pickProducts(displayProducts, ["Baby Clothing", "Nursery"], 2).slice(0, 2).map((product) => <img key={product.id} src={product.imageUrl} alt="" loading="lazy" />)}
          </div>
          <div><p className="storefront-eyebrow">Why families choose Baebe Boo</p><h2>Thoughtfully chosen, delivered with care.</h2><p>Every item is an authentic product shown in real photos with honest sizing — backed by friendly WhatsApp guidance and nationwide delivery, so shopping for your little one feels calm and simple.</p><Link href="/trust" className="storefront-secondary-button mt-5">Our promise to you <ArrowRight size={17} /></Link></div>
        </section>

        <section>
          <SectionHeading eyebrow="Just arrived" title="Fresh little finds" href="/store?sort=newest" />
          {newArrivals.length ? <div className="storefront-product-grid">{newArrivals.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <p className="text-sm text-black/70">New verified products are being prepared.</p>}
        </section>

        <section aria-label="How Baebe Boo works">
          <SectionHeading eyebrow="Simple by design" title="Shopping made calm and simple" href="/store" />
          <div className="storefront-how-grid">
            {[
              { icon: Search, title: "Browse the collection", text: "Explore authentic products by department, age or occasion — with real photos and honest sizing." },
              { icon: MessageCircle, title: "Order online or on WhatsApp", text: "Check out securely, or send your list to our team and we’ll help you finish the order." },
              { icon: Truck, title: "Delivered across Ghana", text: "Branch-supported delivery brings your little one’s essentials right to your door." },
            ].map(({ icon: Icon, title, text }, index) => (
              <div key={title} className="storefront-how-step">
                <span className="storefront-how-num">{index + 1}</span>
                <Icon size={24} strokeWidth={1.75} />
                <strong>{title}</strong>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="storefront-search-section grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
          <div className="storefront-panel">
            <SectionHeading eyebrow="Come say hello" title="Your nearest Baebe Boo" href="/stores" />
            <div className="grid gap-3 sm:grid-cols-2">{shops.slice(0, 4).map((shop) => <Link href="/stores" key={shop.id} className="storefront-shop-card"><MapPin size={20} /><span><strong>{shop.name}</strong><small>{shop.location}</small></span><ArrowRight size={16} /></Link>)}</div>
          </div>
          <div className="storefront-panel storefront-search-panel"><Search size={27} /><p className="storefront-eyebrow">Need a hand?</p><h2>Find it in a few words.</h2><InstantSearch variant="panel" /><small>Popular: fleece hoodie · first shoes · sleep &amp; play</small></div>
        </section>

        <section>
          <SectionHeading eyebrow="The Parenting Hub" title="A little guidance goes a long way" href="/parenting" />
          <div className="storefront-article-grid">{parentingArticles.slice(0, 3).map((article) => <Link href={`/parenting/${article.slug}`} key={article.slug} className="storefront-article-card"><span className="storefront-article-photo"><img src={article.imageUrl} alt={article.imageAlt} loading="lazy" /></span><div className="storefront-article-body-text"><span className="storefront-article-tag">{article.category}</span><h3>{article.title}</h3><p>{article.excerpt}</p><small>{article.minutes} min read <ArrowRight size={14} /></small></div></Link>)}</div>
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
