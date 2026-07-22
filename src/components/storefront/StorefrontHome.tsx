"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Gift, HeartHandshake, MapPin, Search, ShieldCheck, Sparkles, Star, Truck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import MemberForm from "./MemberForm";
import ProductCard from "./ProductCard";
import { StorefrontPage, whatsappUrl } from "./StorefrontChrome";
import { ageRanges, catalogProductFromRow, categories, demoCatalogEnabled, fallbackProducts, fallbackShops, parentingArticles, type PublicCatalogRow, type StorefrontProduct, type StorefrontShop } from "./catalog-data";

type ShopRow = { id: string; name: string | null; location: string | null };

export default function StorefrontHome() {
  const [bestSellers, setBestSellers] = useState(demoCatalogEnabled ? fallbackProducts.slice(0, 4) : []);
  const [newArrivals, setNewArrivals] = useState(demoCatalogEnabled ? fallbackProducts.slice(4, 8) : []);
  const [shops, setShops] = useState<StorefrontShop[]>(demoCatalogEnabled ? fallbackShops : []);

  useEffect(() => {
    let active = true;
    async function load() {
      const [productResult, shopResult, bestSellerResult] = await Promise.all([
        supabase.from("products").select("id,name,category,age_range,gender,price,image_url").eq("is_active", true).order("created_at", { ascending: false }).limit(100),
        supabase.from("shops").select("id,name,location").eq("is_active", true).order("created_at", { ascending: true }),
        supabase.rpc("get_best_selling_products", { p_limit: 4 }),
      ]);
      if (!active) return;
      if (!productResult.error && productResult.data?.length) {
        const mapped = (productResult.data as PublicCatalogRow[]).map(catalogProductFromRow).filter((product): product is StorefrontProduct => Boolean(product));
        setNewArrivals(mapped.slice(0, 4));
        if (!bestSellerResult.error && bestSellerResult.data?.length) {
          const rankedIds = (bestSellerResult.data as Array<{ product_id: string }>).map((entry) => entry.product_id);
          const byId = new Map(mapped.map((product) => [product.id, product]));
          const missingIds = rankedIds.filter((id) => !byId.has(id));
          if (missingIds.length) {
            const missingResult = await supabase.from("products").select("id,name,category,age_range,gender,price,image_url").in("id", missingIds).eq("is_active", true);
            if (!missingResult.error) {
              for (const product of (missingResult.data as PublicCatalogRow[]).map(catalogProductFromRow).filter((item): item is StorefrontProduct => Boolean(item))) byId.set(product.id, product);
            }
          }
          if (active) setBestSellers(rankedIds.map((id) => byId.get(id)).filter((product): product is StorefrontProduct => Boolean(product)));
        } else if (!demoCatalogEnabled) {
          setBestSellers([]);
        }
      }
      if (!shopResult.error && shopResult.data?.length) setShops((shopResult.data as ShopRow[]).map((shop) => ({ id: shop.id, name: shop.name || "Baebe Boo", location: shop.location || "Ghana", hours: "Confirm hours with the store", phone: "" })));
    }
    void load();
    return () => { active = false; };
  }, []);

  return (
    <StorefrontPage>
      <div className="storefront-shell space-y-16 pb-20 pt-28 sm:space-y-24 sm:pt-32">
        <section className="storefront-hero">
          <div className="storefront-hero-copy">
            <p className="storefront-eyebrow"><Sparkles size={14} /> Ghana&apos;s family store</p>
            <h1>Everything Your Little One Needs,<br /><em>All In One Trusted Place.</em></h1>
            <p className="storefront-lead">Clothing, Shoes, Toys, Feeding Essentials, Nursery Items and Gifts Carefully Selected for Babies and Children.</p>
            <div className="flex flex-col gap-3 pt-3 sm:flex-row">
              <Link href="/store" className="storefront-primary-button">Shop now <ArrowRight size={18} /></Link>
              <Link href="/stores" className="storefront-secondary-button">Visit our store <MapPin size={16} /></Link>
              <Link href={whatsappUrl} target="_blank" className="storefront-text-button">Chat on WhatsApp</Link>
            </div>
          </div>
          <div className="storefront-hero-art" aria-label="A joyful, premium collection for little ones">
            <span className="storefront-hero-sun" />
            <div className="storefront-hero-card card-one"><span>soft beginnings</span><strong>Made for cuddles</strong></div>
            <div className="storefront-hero-card card-two"><Gift size={28} /><strong>Gift-ready joy</strong></div>
            <div className="storefront-hero-seal"><span>carefully</span><strong>chosen</strong><span>for families</span></div>
          </div>
        </section>

        <section className="storefront-trust-grid" aria-label="Why families choose Baebe Boo">
          {[{ icon: ShieldCheck, title: "Authentic Products", text: "Quality checked with care" }, { icon: ShieldCheck, title: "Secure Payments", text: "Hosted by Paystack" }, { icon: Truck, title: "Nationwide Delivery", text: "Across Ghana" }, { icon: HeartHandshake, title: "Easy Returns", text: "Helpful support" }, { icon: HeartHandshake, title: "Trusted by Ghanaian Families", text: "Local care" }, { icon: Gift, title: "Fast Customer Support", text: "Real people, happy to help" }].map(({ icon: Icon, title, text }) => <div key={title}><Icon size={22} /><span><strong>{title}</strong><small>{text}</small></span></div>)}
        </section>

        <section>
          <SectionHeading eyebrow="A world of little things" title="Find just what they need" href="/store" />
          <div className="storefront-category-grid">
            {categories.map((category) => <Link key={category.slug} href={`/category/${category.slug}`} data-tone={category.tone} className="storefront-category-card"><span className="text-3xl" aria-hidden="true">{category.emoji}</span><strong>{category.name}</strong><small>Explore collection</small><ArrowRight size={17} /></Link>)}
          </div>
        </section>

        <section className="storefront-age-section">
          <div><p className="storefront-eyebrow">Growing together</p><h2>Shop their age,<br />meet their moment.</h2><p>From first cuddles to first school days, find age-suitable pieces without the guesswork.</p></div>
          <div className="storefront-age-list">{ageRanges.map((age, index) => <Link key={age.slug} href={`/age/${age.slug}`}><span>{String(index + 1).padStart(2, "0")}</span><strong>{age.name}</strong><small>{age.detail}</small><ArrowRight size={17} /></Link>)}</div>
        </section>

        <section>
          <SectionHeading eyebrow="Loved right now" title="Family favourites" href="/store?sort=featured" />
          {bestSellers.length ? <div className="storefront-product-grid">{bestSellers.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <p className="text-sm text-black/50">Customer favourites will appear after verified purchases.</p>}
        </section>

        <section className="storefront-story-banner">
          <div className="storefront-story-art"><span>BAEBE</span><span>BOO</span><i>Chosen with care</i></div>
          <div><p className="storefront-eyebrow">Our promise</p><h2>Chosen like a parent would.</h2><p>We believe shopping for a child should feel joyful, reassuring and beautifully simple. Every Baebe Boo collection is selected for real family life—with comfort, quality and wonder at heart.</p><Link href="/parenting" className="storefront-secondary-button mt-5">Meet the Baebe Boo family <ArrowRight size={17} /></Link></div>
        </section>

        <section>
          <SectionHeading eyebrow="Just arrived" title="Fresh little finds" href="/store?sort=newest" />
          {newArrivals.length ? <div className="storefront-product-grid">{newArrivals.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <p className="text-sm text-black/50">New verified products are being prepared.</p>}
        </section>

        <section className="storefront-reviews">
          <div><p className="storefront-eyebrow">Family notes</p><h2>Loved by Ghanaian families</h2><div className="flex gap-1 text-[#cc9153]">{[1,2,3,4,5].map((star) => <Star key={star} size={18} fill="currentColor" />)}</div><p className="text-sm text-black/50">Genuine customer stories will appear here after review verification.</p></div>
          <div className="storefront-review-placeholder"><Check size={25} /><strong>Verified reviews only</strong><p>We never invent customer voices. This space is ready for approved reviews from real Baebe Boo purchases.</p></div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
          <div className="storefront-panel">
            <SectionHeading eyebrow="Come say hello" title="Your nearest Baebe Boo" href="/stores" />
            <div className="grid gap-3 sm:grid-cols-2">{shops.slice(0, 4).map((shop) => <Link href="/stores" key={shop.id} className="storefront-shop-card"><MapPin size={20} /><span><strong>{shop.name}</strong><small>{shop.location}</small></span><ArrowRight size={16} /></Link>)}</div>
          </div>
          <div className="storefront-panel storefront-search-panel"><Search size={27} /><p className="storefront-eyebrow">Need a hand?</p><h2>Find it in a few words.</h2><form action="/store"><input name="q" aria-label="Search products" placeholder="Try ‘newborn gift’" /><button aria-label="Search"><ArrowRight size={18} /></button></form><small>Popular: feeding sets · first shoes · gifts</small></div>
        </section>

        <section>
          <SectionHeading eyebrow="The Parenting Hub" title="A little guidance goes a long way" href="/parenting" />
          <div className="storefront-article-grid">{parentingArticles.slice(0, 3).map((article, index) => <Link href={`/parenting/${article.slug}`} key={article.slug} data-index={index + 1}><span>{article.category}</span><h3>{article.title}</h3><p>{article.excerpt}</p><small>{article.minutes} min read <ArrowRight size={14} /></small></Link>)}</div>
        </section>

        <section id="family-signup" className="storefront-family-signup scroll-mt-28">
          <div><p className="storefront-eyebrow">The Baebe Boo family</p><h2>Small surprises for your biggest moments.</h2><p>Join for age-relevant ideas, birthday treats, member-first finds and a little more joy in your inbox.</p><ul><li><Check size={16} /> Thoughtful, age-relevant tips</li><li><Check size={16} /> Birthday surprises</li><li><Check size={16} /> Early access to special collections</li></ul></div>
          <MemberForm />
        </section>
      </div>
    </StorefrontPage>
  );
}

function SectionHeading({ eyebrow, title, href }: { eyebrow: string; title: string; href: string }) {
  return <div className="storefront-section-heading"><div><p className="storefront-eyebrow">{eyebrow}</p><h2>{title}</h2></div><Link href={href}>View all <ArrowRight size={16} /></Link></div>;
}
