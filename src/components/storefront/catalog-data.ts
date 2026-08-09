import { formatCedis, formatCedisRange } from "@/domain/money";
import { priceRange } from "@/domain/catalog/variant-selection";
import type { OptionSelection, ProductOption } from "@/domain/catalog/product-options";

/** One buyable version of a product: a combination of option values with its own price. */
export type StorefrontVariant = {
  id: string;
  title: string;
  /** Chosen value per option, keyed by lowercase option name. */
  optionValues: OptionSelection;
  price: number;
  isDefault?: boolean;
  /** The photo this version swaps the gallery to, from `product_media.variant_id`. */
  imageUrl?: string;
};

export type StorefrontProduct = {
  id: string;
  slug: string;
  name: string;
  category: string;
  categorySlug: string;
  age: string;
  ageSlug: string;
  gender: string;
  /** The price of the version the page opens on — what a shopper pays today. */
  price: number;
  /**
   * The span across the versions on sale. Absent on a product with one price,
   * which is why every reader goes through `productPriceRange`.
   */
  priceFrom?: number;
  priceTo?: number;
  compareAtPrice?: number;
  imageUrl: string;
  badge?: string;
  description: string;
  /**
   * The attributes this product is offered in — Colour, Size, Material, or
   * none. There is no hardcoded colour/size pair: a product may have three
   * attributes and none of them need be a colour.
   */
  options: ProductOption[];
  specifications: Array<{ label: string; value: string }>;
  variants?: StorefrontVariant[];
  media?: Array<{
    type: "image" | "video" | "model_3d";
    url: string;
    alt: string;
    /** Set when this photo belongs to one version rather than the product. */
    variantId?: string;
  }>;
};

export type StorefrontShop = {
  id: string;
  name: string;
  location: string;
  hours: string;
  phone: string;
  whatsapp?: string;
};

export type PublicCatalogRow = {
  id: string;
  name: string | null;
  category: string | null;
  age_range: string | null;
  gender: string | null;
  price: number | string | null;
  image_url: string | null;
  /** Admin-pinned homepage placement; only the homepage query selects it. */
  is_featured?: boolean | null;
  /**
   * Optional embed, so a listing can price a variable product honestly.
   * Callers that do not ask for it get a single price, as before.
   */
  product_variants?: Array<{ price: number | string | null; is_active?: boolean | null }> | null;
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
    options: [
      { name: "Colour", values: ["Cream", "Sky", "Blush"] },
      { name: "Size", values: ["Newborn", "0–3M", "3–6M"] },
    ],
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
    options: [
      { name: "Colour", values: ["Sand", "Rose", "Navy"] },
      { name: "Size", values: ["EU 19", "EU 20", "EU 21", "EU 22"] },
    ],
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
    options: [
      { name: "Colour", values: ["Sage", "Peach", "Sky"] },
      { name: "Size", values: ["5-piece set"] },
    ],
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
    options: [
      { name: "Colour", values: ["Rainbow"] },
      { name: "Size", values: ["12 pieces"] },
    ],
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
    options: [
      { name: "Colour", values: ["Mint", "Lavender", "Ochre"] },
      { name: "Size", values: ["Mini"] },
    ],
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
    options: [
      { name: "Colour", values: ["Oat", "Blush", "Blue"] },
      { name: "Size", values: ["One size"] },
    ],
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
    options: [
      { name: "Colour", values: ["Neutral", "Blush", "Blue"] },
      { name: "Size", values: ["Newborn"] },
    ],
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
    options: [
      { name: "Colour", values: ["Black", "Stone", "Olive"] },
      { name: "Size", values: ["One size"] },
    ],
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
  {
    slug: "newborn-essentials-checklist",
    category: "Newborn care",
    title: "The calm, practical newborn essentials checklist",
    excerpt: "What you really need for the first weeks—and what can wait.",
    minutes: 6,
    imageUrl: "/parenting/newborn-essentials-checklist-generated.png",
    imageAlt: "Newborn clothing, blanket, hat, brush and rattle arranged on a soft nursery blanket",
    updatedAt: "2026-07-27",
    ctaLabel: "Shop newborn essentials",
    ctaHref: "/store",
  },
  {
    slug: "starting-solids-with-confidence",
    category: "Feeding",
    title: "Starting solids with confidence",
    excerpt: "A gentle guide to readiness, first tastes and less stressful mealtimes.",
    minutes: 7,
    imageUrl: "/parenting/starting-solids-with-confidence-generated.png",
    imageAlt: "Silicone feeding bowl, bib, divided plate and first foods arranged on a sunny table",
    updatedAt: "2026-07-27",
    ctaLabel: "Shop feeding essentials",
    ctaHref: "/store",
  },
  {
    slug: "choosing-first-shoes",
    category: "Product guide",
    title: "How to choose a first pair of shoes",
    excerpt: "Simple fit checks for growing feet and busy first steps.",
    minutes: 4,
    imageUrl: "/parenting/choosing-first-shoes-generated.png",
    imageAlt: "First-walker baby shoes with socks and a measuring tape on a light wood bench",
    updatedAt: "2026-07-27",
    ctaLabel: "Shop baby shoes",
    ctaHref: "/store",
  },
  {
    slug: "play-for-growing-minds",
    category: "Play & learn",
    title: "Play ideas for growing minds",
    excerpt: "Low-fuss activities that build language, movement and connection.",
    minutes: 5,
    imageUrl: "/parenting/play-for-growing-minds-generated.png",
    imageAlt: "Wooden blocks, shape sorter, board books and soft play toys in a bright play corner",
    updatedAt: "2026-07-27",
    ctaLabel: "Shop toys and books",
    ctaHref: "/store",
  },
] as const;

export type ParentingArticleSlug = (typeof parentingArticles)[number]["slug"];

export interface ParentingArticleSection {
  heading: string;
  paragraphs?: string[];
  list?: string[];
}

export interface ParentingArticleBody {
  deck: string;
  sections: ParentingArticleSection[];
  note: string;
}

export const parentingArticleBodies: Record<ParentingArticleSlug, ParentingArticleBody> = {
  "newborn-essentials-checklist": {
    deck: "The first weeks with a newborn are full enough without a house overflowing with gear. A short list of well-chosen, easy-wash essentials will carry you through — and almost everything else can be picked up later, once you know your baby and your routine.",
    sections: [
      {
        heading: "What you need from day one",
        paragraphs: ["Start with the items you will reach for several times a day. Quantities below are a calm starting point — enough to cover laundry days without a cupboard full of spares."],
        list: [
          "6–8 bodysuits and sleepsuits in soft, breathable cotton — short sleeves suit warm days, with one or two light layers for cool evenings.",
          "Nappies in newborn size, plus unscented wipes or cotton wool for changes.",
          "4–6 muslin cloths for feeds, burps and quick clean-ups.",
          "2–3 light blankets and a safe, flat sleep space with a fitted sheet.",
          "A soft hat for sunny outings and a simple going-home outfit.",
          "A changing mat or a dedicated towel, and a small bag ready for trips out.",
        ],
      },
      {
        heading: "What can wait",
        paragraphs: [
          "Shoes, formal outfits and large toy collections all have their time — just not the first month. Babies outgrow newborn sizes quickly, so buy the next size up only as you need it. If gifts arrive, keep tags on anything you are unsure about and swap for a later size.",
          "The same goes for gadgets. A comfortable chair, good light for night feeds and a washing routine you can manage will do more for your week than most equipment.",
        ],
      },
      {
        heading: "Washing, weather and keeping ahead",
        paragraphs: [
          "Light, quick-dry fabrics are your friend in the Ghanaian heat, and sunshine does the drying for free. Keep a small buffer of clean basics — a couple of extra bodysuits and cloths — so a busy day or a power cut never leaves you without a fresh change.",
        ],
      },
    ],
    note: "Not sure about sizing for a newborn on the way? Our team can help you compare sizes and materials before you buy. Product guidance is never a substitute for medical advice — for anything about your baby's health, speak to a qualified professional.",
  },
  "starting-solids-with-confidence": {
    deck: "Starting solids is a milestone, not a race. Most babies are ready around six months, and the goal at first is simply to explore tastes and textures — milk feeds still do most of the work. Keep the pressure low and let curiosity lead.",
    sections: [
      {
        heading: "Signs your baby may be ready",
        paragraphs: ["Every baby develops at their own pace, so watch your child rather than the calendar. Common signs of readiness include:"],
        list: [
          "Sitting up with little support and holding their head steady.",
          "Showing interest in your food — watching, reaching or leaning in at mealtimes.",
          "Being able to move food to the back of the mouth and swallow, rather than pushing it straight back out.",
        ],
      },
      {
        heading: "First tastes, low pressure",
        paragraphs: [
          "Begin with soft, single-ingredient foods, offered one at a time: well-mashed avocado, ripe banana, softly cooked and mashed yam or plantain, or smooth porridge all make gentle first tastes. Wait a day or two between new foods so you can notice how your baby responds, and keep milk feeds going as usual.",
          "Expect mess — it is part of learning. A bib, a wipe-clean mat and a relaxed face from you go a long way. If a food is refused, simply try again another day; it can take many gentle offers before a new taste is accepted.",
        ],
      },
      {
        heading: "Making mealtimes calmer",
        paragraphs: [
          "Offer food when your baby is alert and not too hungry or tired, sit them upright in a secure seat, and keep portions tiny — a spoonful or two is a real start. Eat together when you can; babies learn a great deal from watching you enjoy your own food.",
        ],
      },
    ],
    note: "Questions about allergies, weight gain or feeding difficulties belong with your paediatrician, midwife or health visitor. This guide is a practical starting point, not medical advice.",
  },
  "choosing-first-shoes": {
    deck: "Bare feet are best while your little one is learning to balance indoors. First shoes earn their place when walking moves outside — protecting soft feet from hot pavements, rough ground and the odd sharp surprise.",
    sections: [
      {
        heading: "When shoes actually matter",
        paragraphs: [
          "Until your child is walking confidently, socks or soft booties are enough indoors and in the buggy. Look for proper first shoes once steps are happening outdoors regularly — around the compound, at the park, on errands with you. In warm weather, breathable materials matter as much as protection.",
        ],
      },
      {
        heading: "Fit checks that matter",
        paragraphs: ["A good first shoe is simple. Run through these checks before you buy:"],
        list: [
          "About a thumb's width of space beyond the longest toe, with the heel held snugly in place.",
          "A sole that bends easily at the ball of the foot — stiff soles make new walkers work too hard.",
          "Lightweight, breathable uppers that let heat escape on warm days.",
          "A secure fastening your child cannot easily undo, but that you can adjust as feet grow.",
          "No rubbing or red marks after a short trial walk around the shop or house.",
        ],
      },
      {
        heading: "Care, rotation and re-checking",
        paragraphs: [
          "Little feet grow fast — check the fit every six to eight weeks in the first walking year. Air shoes out between wears, rotate two pairs if you can, and re-measure both feet each time you buy; one foot is often slightly larger than the other.",
        ],
      },
    ],
    note: "Our team is happy to help you measure little feet and compare fits in store or over WhatsApp. If you have any concerns about how your child walks, a health professional is the right person to ask.",
  },
  "play-for-growing-minds": {
    deck: "Play is how young children learn, and it needs far less equipment than the toy aisle suggests. A handful of well-chosen toys, a few household favourites and your attention will take you a very long way.",
    sections: [
      {
        heading: "For babies (0–12 months)",
        paragraphs: ["In the first year, play is mostly about senses and connection. Short, happy bursts through the day beat one long session."],
        list: [
          "Tummy time on a firm mat, a few minutes at a time, with a toy or your face just in view.",
          "Peekaboo, gentle tickles and songs — repetition is the whole point.",
          "Rattles, teethers and soft blocks to grasp, shake and safely mouth.",
          "Board books with bold pictures; name what you see and let them pat the pages.",
        ],
      },
      {
        heading: "For toddlers (1–3 years)",
        paragraphs: ["Toddlers want to move, copy and test. Offer activities that let them do all three:"],
        list: [
          "Stacking cups or blocks — build towers together and let them enjoy the demolition.",
          "Simple sorting: shapes into a sorter, or spoons into one bowl and cups into another.",
          "Pretend play with a toy phone, a pot and spoon, or a dolly to feed.",
          "Songs with actions, and plenty of safe space to climb, push and pull.",
        ],
      },
      {
        heading: "Keeping it low-fuss",
        paragraphs: [
          "Rotate a small set of toys rather than putting everything out at once — old favourites feel new again after a week away. Follow your child's lead, join in for a few minutes, then let them potter while you get on with your own tasks nearby. That balance of together and independent play is where confidence grows.",
        ],
      },
    ],
    note: "Always choose age-appropriate toys and follow the maker's safety guidance, especially for little ones who still explore with their mouths. Our team can help you check age suitability before you buy.",
  },
};

export function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** Storefront prices go through the one cedi formatter, like everything else. */
export function formatPrice(price: number): string {
  return formatCedis(price);
}

/**
 * The span a product sells across, with a single price as the floor.
 *
 * Callers never touch `priceFrom`/`priceTo` directly: most products have one
 * price and no range at all, and a listing card that had to remember that
 * would get it wrong the first time somebody added a second variant.
 */
export function productPriceRange(product: StorefrontProduct): { from: number; to: number } {
  const from = Number.isFinite(product.priceFrom) ? (product.priceFrom as number) : product.price;
  const to = Number.isFinite(product.priceTo) ? (product.priceTo as number) : product.price;
  return { from: Math.min(from, to), to: Math.max(from, to) };
}

/** "GH₵189.00", or "From GH₵189.00" once the versions cost different amounts. */
export function productPriceLabel(product: StorefrontProduct): string {
  const { from, to } = productPriceRange(product);
  return formatCedisRange(from, to);
}

export function catalogProductFromRow(row: PublicCatalogRow): StorefrontProduct | null {
  const name = row.name?.trim();
  const price = Number(row.price);
  if (!row.id || !name || !Number.isFinite(price) || price < 0) return null;
  const category = row.category?.trim() || "Other";
  const age = row.age_range?.trim() || "Ask our team";
  // A listing only knows a product's versions when it asked for them; without
  // the embed the product prices as it always did, at its own `price`.
  const embedded = Array.isArray(row.product_variants) ? row.product_variants : [];
  const range = embedded.length
    ? priceRange(embedded.map((variant, index) => ({
        id: `${row.id}-${index}`,
        price: variant.price,
        is_active: variant.is_active ?? true,
      })))
    : { from: price, to: price };
  return {
    id: row.id,
    slug: `${slugify(name)}-${row.id}`,
    name,
    category,
    categorySlug: slugify(category),
    age,
    ageSlug: slugify(age.replace("+", "plus")),
    gender: row.gender?.trim() || "Ask our team",
    price: range.from > 0 ? range.from : price,
    priceFrom: range.from > 0 ? range.from : price,
    priceTo: range.to > 0 ? range.to : price,
    imageUrl: row.image_url || "",
    description: "Verified product details are available from our team.",
    options: [],
    specifications: [],
    ...(row.is_featured === true ? { badge: "Featured" } : {}),
  };
}

export function findProduct(slug: string): StorefrontProduct | undefined {
  return fallbackProducts.find((product) => product.slug === slug || product.id === slug);
}
