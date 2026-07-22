export type StorefrontProduct = {
  id: string;
  slug: string;
  name: string;
  category: string;
  categorySlug: string;
  age: string;
  ageSlug: string;
  gender: string;
  price: number;
  compareAtPrice?: number;
  imageUrl: string;
  badge?: string;
  description: string;
  colors: string[];
  sizes: string[];
  specifications: Array<{ label: string; value: string }>;
  variants?: Array<{
    id: string;
    title: string;
    color?: string;
    size?: string;
    price: number;
  }>;
  media?: Array<{
    type: "image" | "video" | "model_3d";
    url: string;
    alt: string;
  }>;
};

export type StorefrontShop = {
  id: string;
  name: string;
  location: string;
  hours: string;
  phone: string;
};

export const demoCatalogEnabled =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_ENABLE_DEMO_CATALOG === "true";

export const categories = [
  { name: "Baby Clothing", slug: "baby-clothing", emoji: "🧸", tone: "pink" },
  { name: "Baby Shoes", slug: "baby-shoes", emoji: "👟", tone: "blue" },
  { name: "Feeding", slug: "feeding", emoji: "🍼", tone: "mint" },
  { name: "Toys", slug: "toys", emoji: "🪁", tone: "lilac" },
  { name: "School Essentials", slug: "school-essentials", emoji: "🎒", tone: "gold" },
  { name: "Nursery", slug: "nursery", emoji: "🌙", tone: "blue" },
  { name: "Gift Sets", slug: "gift-sets", emoji: "🎁", tone: "pink" },
  { name: "Maternity", slug: "maternity", emoji: "🤍", tone: "mint" },
  { name: "Clearance", slug: "clearance", emoji: "✨", tone: "gold" },
] as const;

export const ageRanges = [
  { name: "Newborn", detail: "0–3 months", slug: "0-3-months" },
  { name: "Little explorer", detail: "3–6 months", slug: "3-6-months" },
  { name: "On the move", detail: "6–12 months", slug: "6-12-months" },
  { name: "First steps", detail: "1–2 years", slug: "1-2-years" },
  { name: "Big imagination", detail: "2–4 years", slug: "2-4-years" },
  { name: "Growing minds", detail: "4–6 years", slug: "4-6-years" },
  { name: "School stars", detail: "6+ years", slug: "6-plus-years" },
] as const;

export const fallbackProducts: StorefrontProduct[] = [
  {
    id: "fallback-organic-romper",
    slug: "cloud-soft-organic-romper",
    name: "Cloud-Soft Organic Romper",
    category: "Baby Clothing",
    categorySlug: "baby-clothing",
    age: "0–3 Months",
    ageSlug: "0-3-months",
    gender: "Unisex",
    price: 189,
    compareAtPrice: 220,
    imageUrl: "",
    badge: "Parent favourite",
    description: "A breathable everyday romper made for gentle cuddles, easy changes and warm Ghanaian days.",
    colors: ["Cream", "Sky", "Blush"],
    sizes: ["Newborn", "0–3M", "3–6M"],
    specifications: [
      { label: "Material", value: "Soft organic cotton blend" },
      { label: "Care", value: "Machine wash cold" },
      { label: "Fastening", value: "Nickel-free poppers" },
    ],
  },
  {
    id: "fallback-first-steps",
    slug: "first-steps-flex-trainers",
    name: "First Steps Flex Trainers",
    category: "Baby Shoes",
    categorySlug: "baby-shoes",
    age: "1–2 Years",
    ageSlug: "1-2-years",
    gender: "Unisex",
    price: 245,
    imageUrl: "",
    badge: "New",
    description: "Flexible, supportive first shoes with a roomy toe box and simple hook-and-loop fastening.",
    colors: ["Sand", "Rose", "Navy"],
    sizes: ["EU 19", "EU 20", "EU 21", "EU 22"],
    specifications: [
      { label: "Sole", value: "Flexible non-slip rubber" },
      { label: "Fit", value: "Wide, rounded toe box" },
      { label: "Fastening", value: "Hook and loop" },
    ],
  },
  {
    id: "fallback-feeding-set",
    slug: "little-taster-feeding-set",
    name: "Little Taster Feeding Set",
    category: "Feeding",
    categorySlug: "feeding",
    age: "6–12 Months",
    ageSlug: "6-12-months",
    gender: "Unisex",
    price: 175,
    imageUrl: "",
    badge: "Best seller",
    description: "A practical weaning set with a suction bowl, divided plate, cup, bib and soft spoon.",
    colors: ["Sage", "Peach", "Sky"],
    sizes: ["5-piece set"],
    specifications: [
      { label: "Material", value: "Food-grade silicone" },
      { label: "Care", value: "Dishwasher safe" },
      { label: "Safety", value: "BPA and phthalate free" },
    ],
  },
  {
    id: "fallback-stacking-toy",
    slug: "rainbow-stacking-garden",
    name: "Rainbow Stacking Garden",
    category: "Toys",
    categorySlug: "toys",
    age: "2–4 Years",
    ageSlug: "2-4-years",
    gender: "Unisex",
    price: 159,
    imageUrl: "",
    badge: "Learning through play",
    description: "Open-ended wooden shapes that help little hands practise colour, balance and creative play.",
    colors: ["Rainbow"],
    sizes: ["12 pieces"],
    specifications: [
      { label: "Material", value: "Responsibly sourced wood" },
      { label: "Finish", value: "Water-based child-safe paint" },
      { label: "Age", value: "24 months and above" },
    ],
  },
  {
    id: "fallback-backpack",
    slug: "adventure-mini-backpack",
    name: "Adventure Mini Backpack",
    category: "School Essentials",
    categorySlug: "school-essentials",
    age: "4–6 Years",
    ageSlug: "4-6-years",
    gender: "Unisex",
    price: 275,
    imageUrl: "",
    badge: "Back to school",
    description: "A light, wipe-clean backpack sized for nursery adventures, snacks and treasured finds.",
    colors: ["Mint", "Lavender", "Ochre"],
    sizes: ["Mini"],
    specifications: [
      { label: "Capacity", value: "8 litres" },
      { label: "Straps", value: "Padded and adjustable" },
      { label: "Care", value: "Wipe clean" },
    ],
  },
  {
    id: "fallback-nursery",
    slug: "dreamy-night-comforter",
    name: "Dreamy Night Comforter",
    category: "Nursery",
    categorySlug: "nursery",
    age: "3–6 Months",
    ageSlug: "3-6-months",
    gender: "Unisex",
    price: 135,
    imageUrl: "",
    badge: "Gentle comfort",
    description: "A soft, lightweight comforter designed for supervised cuddles and calm bedtime routines.",
    colors: ["Oat", "Blush", "Blue"],
    sizes: ["One size"],
    specifications: [
      { label: "Fabric", value: "Velvety plush" },
      { label: "Care", value: "Machine wash at 30°C" },
      { label: "Use", value: "Supervised use only" },
    ],
  },
  {
    id: "fallback-gift",
    slug: "hello-little-one-gift-box",
    name: "Hello Little One Gift Box",
    category: "Gift Sets",
    categorySlug: "gift-sets",
    age: "0–3 Months",
    ageSlug: "0-3-months",
    gender: "Unisex",
    price: 395,
    imageUrl: "",
    badge: "Gift-ready",
    description: "A beautifully presented welcome box with cosy essentials for baby and a keepsake card for family.",
    colors: ["Neutral", "Blush", "Blue"],
    sizes: ["Newborn"],
    specifications: [
      { label: "Includes", value: "Romper, hat, bib, blanket and card" },
      { label: "Packaging", value: "Reusable premium gift box" },
      { label: "Personalisation", value: "Gift message included" },
    ],
  },
  {
    id: "fallback-maternity",
    slug: "everyday-mama-tote",
    name: "Everyday Mama Organiser Tote",
    category: "Maternity",
    categorySlug: "maternity",
    age: "All Ages",
    ageSlug: "all-ages",
    gender: "Women",
    price: 420,
    imageUrl: "",
    badge: "Made for real days",
    description: "A considered changing tote with insulated pockets, a wipe-clean lining and room for parent essentials.",
    colors: ["Black", "Stone", "Olive"],
    sizes: ["One size"],
    specifications: [
      { label: "Pockets", value: "10 organiser pockets" },
      { label: "Included", value: "Changing mat and stroller straps" },
      { label: "Care", value: "Wipe-clean lining" },
    ],
  },
];

export const fallbackShops: StorefrontShop[] = [
  { id: "accra", name: "Baebe Boo Accra", location: "Accra, Ghana", hours: "Mon–Sat, 9am–7pm", phone: "+233 00 000 0000" },
  { id: "kumasi", name: "Baebe Boo Kumasi", location: "Kumasi, Ghana", hours: "Mon–Sat, 9am–7pm", phone: "+233 00 000 0000" },
];

export const parentingArticles = [
  { slug: "newborn-essentials-checklist", category: "Newborn care", title: "The calm, practical newborn essentials checklist", excerpt: "What you really need for the first weeks—and what can wait.", minutes: 6 },
  { slug: "starting-solids-with-confidence", category: "Feeding", title: "Starting solids with confidence", excerpt: "A gentle guide to readiness, first tastes and less stressful mealtimes.", minutes: 7 },
  { slug: "choosing-first-shoes", category: "Product guide", title: "How to choose a first pair of shoes", excerpt: "Simple fit checks for growing feet and busy first steps.", minutes: 4 },
  { slug: "play-for-growing-minds", category: "Play & learn", title: "Play ideas for growing minds", excerpt: "Low-fuss activities that build language, movement and connection.", minutes: 5 },
] as const;

export function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 }).format(price);
}

export function findProduct(slug: string): StorefrontProduct | undefined {
  return fallbackProducts.find((product) => product.slug === slug || product.id === slug);
}
