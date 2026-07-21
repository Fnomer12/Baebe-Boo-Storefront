import ProductCard from "./ProductCard";
import { PageIntro, StorefrontPage } from "./StorefrontChrome";
import { fallbackProducts } from "./catalog-data";

export default function CollectionPage({ eyebrow, title, description, filter }: { eyebrow: string; title: string; description: string; filter: (product: (typeof fallbackProducts)[number]) => boolean }) {
  const products = fallbackProducts.filter(filter);
  const visible = products.length ? products : fallbackProducts;
  return (
    <StorefrontPage>
      <div className="storefront-shell pb-20 pt-28 sm:pt-32">
        <PageIntro eyebrow={eyebrow} title={title} description={description} />
        <p className="mb-6 text-sm text-black/50">{visible.length} thoughtful picks</p>
        <div className="storefront-product-grid">{visible.map((product) => <ProductCard key={product.id} product={product} />)}</div>
      </div>
    </StorefrontPage>
  );
}
