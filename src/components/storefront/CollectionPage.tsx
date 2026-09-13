import ProductCard from "./ProductCard";
import { PageIntro, StorefrontPage } from "./StorefrontChrome";
import { demoCatalogEnabled, fallbackProducts, type StorefrontProduct } from "./catalog-data";
import { listStorefrontProducts } from "@/lib/storefront-product";

export default async function CollectionPage({ eyebrow, title, description, filter }: { eyebrow: string; title: string; description: string; filter: (product: StorefrontProduct) => boolean }) {
  const catalog = demoCatalogEnabled ? fallbackProducts : await listStorefrontProducts();
  const visible = catalog.filter(filter);
  return (
    <StorefrontPage showReadinessBanner>
      <div className="storefront-shell pb-20 pt-28 sm:pt-32">
        <PageIntro eyebrow={eyebrow} title={title} description={description} />
        <p className="mb-6 text-sm text-black/50">{visible.length} thoughtful picks</p>
        {visible.length ? <div className="storefront-product-grid">{visible.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="storefront-empty"><h2>No verified products here yet</h2><p>Try the full shop or ask our team for help.</p></div>}
      </div>
    </StorefrontPage>
  );
}
