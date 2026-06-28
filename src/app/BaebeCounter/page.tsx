"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BaebeCounter, { CounterTab } from "@/components/BaebeCounter";
import {
  Baby,
  Banknote,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";

type Product = {
  id: string;
  name: string;
  category: string;
  ageRange: string;
  gender: string;
  sku: string;
  price: number;
  imageUrl: string;
  stock: number;
};

type CounterItem = Product & {
  quantity: number;
  orderType: "instore";
};

type PaymentMethod = "cash" | "visa" | "momo";

const ageRanges = [
  "All Ages",
  "0–3 Months",
  "3–6 Months",
  "6–12 Months",
  "1–2 Years",
  "2–4 Years",
  "4–6 Years",
  "6+ Years",
];

export default function BaebeCounterPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<CounterTab>("store");

  useEffect(() => {
    const verifyGoogleAuth = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session?.user?.email) {
        router.replace("/BaebeCounter/login");
        return;
      }

      sessionStorage.setItem("baebe_counter_auth", "true");
      sessionStorage.setItem("baebe_counter_email", data.session.user.email);
      setChecking(false);
    };

    verifyGoogleAuth();
  }, [router]);

  if (checking) {
    return (
      <main className="flex h-screen items-center justify-center bg-white text-black">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-black/10 border-t-black" />
          <p className="mt-4 text-sm text-black/50">Verifying Google access...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen overflow-hidden bg-white text-black">
      <section className="flex h-full">
        <BaebeCounter activeTab={activeTab} setActiveTab={setActiveTab} />

        <section className="flex-1 overflow-y-auto bg-white">
          <div className="mx-auto max-w-7xl px-8 py-10">
            {activeTab === "store" && <StoreSection />}
            {activeTab === "online-purchase" && <OnlinePurchaseSection />}
          </div>
        </section>
      </section>
    </main>
  );
}

function StoreSection() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [counterItems, setCounterItems] = useState<CounterItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [loading, setLoading] = useState(true);

  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  const [category, setCategory] = useState("All Categories");
  const [ageRange, setAgeRange] = useState("All Ages");
  const [page, setPage] = useState(1);

  const pageSize = 12;

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);

      const shopId = sessionStorage.getItem("baebe_counter_shop_id");

      if (!shopId) {
        setProducts([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("product_shop_availability")
        .select(`
          stock_quantity,
          is_available,
          products (
            id,
            name,
            category,
            age_range,
            gender,
            sku,
            price,
            image_url,
            is_active
          )
        `)
        .eq("shop_id", shopId)
        .eq("is_available", true)
        .gt("stock_quantity", 0);

      if (error) {
        console.error(error.message);
        setProducts([]);
        setLoading(false);
        return;
      }

      const mapped = (data || [])
        .map((row: any) => {
          const product = Array.isArray(row.products)
            ? row.products[0]
            : row.products;

          if (!product || product.is_active !== true) return null;

          return {
            id: product.id,
            name: product.name || "",
            category: product.category || "Uncategorized",
            ageRange: product.age_range || "",
            gender: product.gender || "",
            sku: product.sku || "NO-SKU",
            price: Number(product.price || 0),
            imageUrl: product.image_url || "",
            stock: Number(row.stock_quantity || 0),
          };
        })
        .filter(Boolean) as Product[];

      setProducts(mapped);
      setLoading(false);
    };

    fetchProducts();
  }, []);

  const categories = useMemo(() => {
    return [
      "All Categories",
      ...Array.from(new Set(products.map((p) => p.category).filter(Boolean))),
    ];
  }, [products]);

  const filteredProducts = products.filter((product) => {
    const searchText = `${product.name} ${product.sku}`.toLowerCase();

    return (
      searchText.includes(search.toLowerCase()) &&
      (category === "All Categories" || product.category === category) &&
      (ageRange === "All Ages" || product.ageRange === ageRange)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));

  const paginatedProducts = filteredProducts.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const selectedProducts = products.filter((product) =>
    selectedIds.includes(product.id)
  );

  const toggleProduct = (productId: string) => {
    setSelectedIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  const clearFilters = () => {
    setCategory("All Categories");
    setAgeRange("All Ages");
    setPage(1);
  };

  const proceed = () => {
    const items: CounterItem[] = selectedProducts.map((product) => ({
      ...product,
      quantity: 1,
      orderType: "instore",
    }));

    setCounterItems(items);
    sessionStorage.setItem("baebe_counter_selected_items", JSON.stringify(items));
    setModalOpen(true);
  };

  const updateCounterItems = (items: CounterItem[]) => {
    setCounterItems(items);
    sessionStorage.setItem("baebe_counter_selected_items", JSON.stringify(items));

    if (items.length === 0) {
      setModalOpen(false);
      setSelectedIds([]);
    }
  };

  const increaseItem = (id: string) => {
    updateCounterItems(
      counterItems.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity:
                item.quantity >= item.stock ? item.quantity : item.quantity + 1,
            }
          : item
      )
    );
  };

  const decreaseItem = (id: string) => {
    updateCounterItems(
      counterItems.map((item) =>
        item.id === id
          ? { ...item, quantity: Math.max(1, item.quantity - 1) }
          : item
      )
    );
  };

  const removeItem = (id: string) => {
    updateCounterItems(counterItems.filter((item) => item.id !== id));
    setSelectedIds((prev) => prev.filter((itemId) => itemId !== id));
  };

  const total = counterItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  return (
    <div>
      <div className="sticky top-0 z-20 mb-8 border-b border-black/10 bg-white/90 pb-6 backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-black/35">
              Counter Store
            </p>

            <h2 className="mt-2 text-4xl font-semibold">Store</h2>

            <p className="mt-2 text-sm text-black/50">
              View and select products available in this shop.
            </p>
          </div>

          {selectedIds.length > 0 && (
            <button
              onClick={proceed}
              className="rounded-full bg-black px-7 py-4 text-sm font-semibold text-white"
            >
              Proceed ({selectedIds.length})
            </button>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div
            className={`flex h-12 items-center overflow-hidden rounded-full border border-black/10 bg-white shadow-sm transition-all duration-300 ${
              searchOpen ? "w-80 px-4" : "w-12 px-0"
            }`}
          >
            {searchOpen && (
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search product or SKU..."
                className="w-full bg-transparent text-sm outline-none"
                autoFocus
              />
            )}

            <button
              onClick={() => {
                if (searchOpen) {
                  setSearch("");
                  setSearchOpen(false);
                  setPage(1);
                } else {
                  setSearchOpen(true);
                }
              }}
              className="flex h-12 w-12 shrink-0 items-center justify-center"
            >
              {searchOpen ? <X size={18} /> : <Search size={18} />}
            </button>
          </div>

          <button
            onClick={() => setFilterOpen(true)}
            className="flex h-12 items-center gap-2 rounded-full border border-black/10 bg-white px-5 text-sm font-semibold shadow-sm"
          >
            <SlidersHorizontal size={18} />
            Filter
          </button>
        </div>
      </div>

      {filterOpen && (
        <>
          <div
            onClick={() => setFilterOpen(false)}
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-sm"
          />

          <aside className="fixed right-0 top-0 z-50 h-screen w-full max-w-[460px] overflow-y-auto bg-white p-7 shadow-2xl">
            <div className="mb-8 flex items-center justify-between border-b border-black/10 pb-5">
              <div>
                <h2 className="text-3xl font-semibold">Filters</h2>
                <p className="mt-1 text-sm text-black/45">
                  Find the perfect baby item
                </p>
              </div>

              <button
                onClick={() => setFilterOpen(false)}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-black/40">
                Categories
              </p>

              <div className="space-y-3">
                {categories.map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      setCategory(item);
                      setPage(1);
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl border px-5 py-5 text-left text-sm font-semibold transition ${
                      category === item
                        ? "border-black bg-black text-white"
                        : "border-black/10 bg-white text-black hover:border-black"
                    }`}
                  >
                    <span>{item}</span>
                    {category === item && <Check size={17} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-black/40">
                Age Range
              </p>

              <div className="flex flex-wrap gap-3">
                {ageRanges.map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      setAgeRange(item);
                      setPage(1);
                    }}
                    className={`rounded-full border px-5 py-3 text-sm font-semibold transition ${
                      ageRange === item
                        ? "border-black bg-black text-white"
                        : "border-black/10 bg-white text-black/60"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-3 border-t border-black/10 pt-6">
              <button
                onClick={clearFilters}
                className="h-14 rounded-full border border-black/10 text-sm font-semibold"
              >
                Clear
              </button>

              <button
                onClick={() => setFilterOpen(false)}
                className="h-14 rounded-full bg-black text-sm font-semibold text-white"
              >
                Apply Filters
              </button>
            </div>
          </aside>
        </>
      )}

      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-80 animate-pulse rounded-[2rem] bg-black/[0.04]"
            />
          ))}
        </div>
      ) : paginatedProducts.length === 0 ? (
        <div className="rounded-[2rem] border border-black/10 bg-white p-10 text-center shadow-sm">
          <h3 className="text-2xl font-semibold">No products found</h3>
          <p className="mt-2 text-sm text-black/50">
            Try another search or filter.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {paginatedProducts.map((product) => {
              const selected = selectedIds.includes(product.id);

              return (
                <div
                  key={product.id}
                  onClick={() => toggleProduct(product.id)}
                  className={`relative cursor-pointer overflow-hidden rounded-[2rem] border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md ${
                    selected ? "border-black" : "border-black/10"
                  }`}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleProduct(product.id);
                    }}
                    className={`absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border shadow-sm ${
                      selected
                        ? "border-black bg-black text-white"
                        : "border-black/10 bg-white text-black"
                    }`}
                  >
                    {selected && <Check size={16} />}
                  </button>

                  <div className="aspect-square bg-[#F8F5F0]">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Baby size={34} className="text-black/25" />
                      </div>
                    )}
                  </div>

                  <div className="p-5">
                    <p className="text-xs uppercase tracking-wide text-black/40">
                      {product.category}
                    </p>

                    <h3 className="mt-1 text-lg font-semibold">{product.name}</h3>

                    <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-black/35">
                      SKU: {product.sku}
                    </p>

                    <p className="mt-1 text-xs text-black/45">
                      {product.ageRange} · {product.gender}
                    </p>

                    <div className="mt-4 flex items-center justify-between">
                      <p className="font-bold">GH₵{product.price}</p>
                      <p className="rounded-full bg-black/[0.04] px-3 py-1 text-xs font-semibold text-black/50">
                        Stock: {product.stock}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              disabled={page === 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 disabled:opacity-40"
            >
              <ChevronLeft size={18} />
            </button>

            <p className="text-sm font-semibold text-black/50">
              Page {page} of {totalPages}
            </p>

            <button
              disabled={page === totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black text-white disabled:opacity-40"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </>
      )}

      {modalOpen && (
        <ProceedCounterModal
          items={counterItems}
          total={total}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          onClose={() => setModalOpen(false)}
          onIncrease={increaseItem}
          onDecrease={decreaseItem}
          onRemove={removeItem}
        />
      )}
    </div>
  );
}

function ProceedCounterModal({
  items,
  total,
  paymentMethod,
  setPaymentMethod,
  onClose,
  onIncrease,
  onDecrease,
  onRemove,
}: {
  items: CounterItem[];
  total: number;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (method: PaymentMethod) => void;
  onClose: () => void;
  onIncrease: (id: string) => void;
  onDecrease: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 px-4 backdrop-blur-xl">
      <section className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-white/60 bg-white/80 p-6 shadow-2xl backdrop-blur-2xl">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full bg-black text-white"
        >
          <X size={20} />
        </button>

        <div className="pr-14">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-black/40">
            Proceed Counter
          </p>
          <h2 className="mt-2 text-3xl font-semibold">Review Purchase</h2>
          <p className="mt-1 text-sm text-black/50">
            Confirm selected items, quantity and payment method.
          </p>
        </div>

        <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="grid gap-4 rounded-[1.5rem] border border-black/10 bg-white/80 p-4 shadow-sm md:grid-cols-[90px_1fr_auto]"
              >
                <div className="h-24 w-24 overflow-hidden rounded-2xl bg-[#F8F5F0]">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Baby size={28} className="text-black/25" />
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-black/40">
                    {item.category}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold">{item.name}</h3>
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-black/35">
                    SKU: {item.sku}
                  </p>
                  <p className="mt-1 text-xs text-black/45">
                    {item.ageRange} · {item.gender}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-black/40">
                    Available stock: {item.stock}
                  </p>

                  <button
                    onClick={() => onRemove(item.id)}
                    className="mt-3 flex items-center gap-2 text-xs font-semibold text-red-500"
                  >
                    <Trash2 size={14} />
                    Remove
                  </button>
                </div>

                <div className="flex items-center justify-between gap-5 md:flex-col md:items-end">
                  <p className="text-lg font-bold">
                    GH₵{(item.price * item.quantity).toLocaleString()}
                  </p>

                  <div className="flex items-center gap-3 rounded-full bg-[#F8F5F0] p-1">
                    <button
                      onClick={() => onDecrease(item.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white"
                    >
                      <Minus size={15} />
                    </button>

                    <span className="w-6 text-center text-sm font-bold">
                      {item.quantity}
                    </span>

                    <button
                      onClick={() => onIncrease(item.id)}
                      disabled={item.quantity >= item.stock}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white disabled:bg-black/25"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <aside className="h-fit rounded-[1.8rem] border border-black/10 bg-white/90 p-5 shadow-sm">
            <h3 className="text-xl font-semibold">Payment</h3>

            <div className="mt-5 space-y-3">
              <PaymentButton
                label="Cash"
                icon={Banknote}
                active={paymentMethod === "cash"}
                onClick={() => setPaymentMethod("cash")}
              />

              <PaymentButton
                label="Visa Card"
                icon={CreditCard}
                active={paymentMethod === "visa"}
                onClick={() => setPaymentMethod("visa")}
              />

              <PaymentButton
                label="Mobile Money"
                icon={Smartphone}
                active={paymentMethod === "momo"}
                onClick={() => setPaymentMethod("momo")}
              />
            </div>

            <div className="mt-6 border-t border-black/10 pt-5">
              <div className="flex justify-between text-sm text-black/50">
                <span>Items</span>
                <span>{items.reduce((sum, item) => sum + item.quantity, 0)}</span>
              </div>

              <div className="mt-3 flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>GH₵{total.toLocaleString()}</span>
              </div>
            </div>

            <button className="mt-6 h-14 w-full rounded-full bg-black text-sm font-semibold text-white">
              Complete Sale
            </button>
          </aside>
        </div>
      </section>
    </div>
  );
}

function PaymentButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: any;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-14 w-full items-center justify-between rounded-2xl border px-4 text-sm font-semibold transition ${
        active
          ? "border-black bg-black text-white"
          : "border-black/10 bg-white text-black"
      }`}
    >
      <span className="flex items-center gap-3">
        <Icon size={18} />
        {label}
      </span>

      {active && <Check size={17} />}
    </button>
  );
}

function OnlinePurchaseSection() {
  return (
    <div>
      <PageHeader
        title="Online Purchase"
        subtitle="Approve and manage online customer purchases."
      />

      <div className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
        <ShoppingBag size={34} />
        <h2 className="mt-6 text-2xl font-semibold">Online Purchases</h2>
        <p className="mt-2 text-sm text-black/50">
          Online orders will show here.
        </p>
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-8 border-b border-black/10 pb-6">
      <h2 className="text-4xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-black/50">{subtitle}</p>
    </div>
  );
}