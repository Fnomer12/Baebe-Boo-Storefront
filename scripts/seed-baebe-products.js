/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv(file) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
}

loadEnv(path.join(process.cwd(), ".env.production"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("Missing Supabase production URL or service key.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const products = [
  {
    slug: "cloud-soft-organic-romper",
    name: "Cloud-Soft Organic Romper",
    category: "Baby Clothing",
    ageRange: "0–3 Months",
    gender: "Unisex",
    price: 189,
    compareAtPrice: 220,
    colors: ["Cream", "Sky", "Blush"],
    sizes: ["Newborn", "0–3M", "3–6M"],
    badge: "Parent favourite",
    description: "A breathable everyday romper made for gentle cuddles, easy changes and warm Ghanaian days.",
    palette: ["#f6d7c9", "#dceef2", "#fff8ef"],
    icon: "romper",
  },
  {
    slug: "snuggle-zip-sleepsuit",
    name: "Snuggle Zip Sleepsuit",
    category: "Baby Clothing",
    ageRange: "3–6 Months",
    gender: "Unisex",
    price: 165,
    compareAtPrice: 195,
    colors: ["Oat", "Mint"],
    sizes: ["0–3M", "3–6M", "6–12M"],
    badge: "Sleep-ready",
    description: "A soft zip sleepsuit with covered feet and a smooth guard for quick night changes.",
    palette: ["#e8ddcf", "#d7eadf", "#fffaf4"],
    icon: "sleepsuit",
  },
  {
    slug: "everyday-bodysuit-three-pack",
    name: "Everyday Bodysuit 3-Pack",
    category: "Baby Clothing",
    ageRange: "0–3 Months",
    gender: "Unisex",
    price: 210,
    colors: ["Neutral Mix", "Pastel Mix"],
    sizes: ["Newborn", "0–3M", "3–6M"],
    badge: "3-pack",
    description: "Three soft bodysuits with envelope necklines and nickel-free poppers for easy layering.",
    palette: ["#f7e2db", "#f9f0be", "#dbeee7"],
    icon: "bodysuits",
  },
  {
    slug: "first-steps-flex-trainers",
    name: "First Steps Flex Trainers",
    category: "Baby Shoes",
    ageRange: "1–2 Years",
    gender: "Unisex",
    price: 245,
    colors: ["Sand", "Rose", "Navy"],
    sizes: ["EU 19", "EU 20", "EU 21", "EU 22"],
    badge: "New",
    description: "Flexible, supportive first shoes with a roomy toe box and simple hook-and-loop fastening.",
    palette: ["#dbc1a7", "#f3c4c9", "#263852"],
    icon: "shoe",
  },
  {
    slug: "tiny-explorer-sandals",
    name: "Tiny Explorer Sandals",
    category: "Baby Shoes",
    ageRange: "2–4 Years",
    gender: "Unisex",
    price: 225,
    compareAtPrice: 260,
    colors: ["Tan", "Lilac"],
    sizes: ["EU 22", "EU 23", "EU 24", "EU 25"],
    badge: "Warm weather",
    description: "Lightweight toddler sandals with a cushioned footbed for park days and family visits.",
    palette: ["#d6a87a", "#d9c7ee", "#fff2df"],
    icon: "sandal",
  },
  {
    slug: "little-taster-feeding-set",
    name: "Little Taster Feeding Set",
    category: "Feeding",
    ageRange: "6–12 Months",
    gender: "Unisex",
    price: 175,
    colors: ["Sage", "Peach", "Sky"],
    sizes: ["5-piece set"],
    badge: "Best seller",
    description: "A practical weaning set with a suction bowl, divided plate, cup, bib and soft spoon.",
    palette: ["#a9c9b7", "#f4bf9d", "#c5e7f4"],
    icon: "feeding",
  },
  {
    slug: "silicone-snack-cup-and-bib",
    name: "Silicone Snack Cup & Bib",
    category: "Feeding",
    ageRange: "1–2 Years",
    gender: "Unisex",
    price: 145,
    colors: ["Honey", "Sage"],
    sizes: ["Cup + bib"],
    badge: "Easy clean",
    description: "A soft catch-all bib and spill-resistant snack cup for meals at home or on the go.",
    palette: ["#f4c46f", "#b7d5b6", "#fff7e8"],
    icon: "cup",
  },
  {
    slug: "rainbow-stacking-garden",
    name: "Rainbow Stacking Garden",
    category: "Toys",
    ageRange: "2–4 Years",
    gender: "Unisex",
    price: 159,
    colors: ["Rainbow"],
    sizes: ["12 pieces"],
    badge: "Learning through play",
    description: "Open-ended wooden shapes that help little hands practise colour, balance and creative play.",
    palette: ["#ef9a9a", "#f9cf72", "#8dc9c2"],
    icon: "rainbow",
  },
  {
    slug: "soft-bunny-comfort-toy",
    name: "Soft Bunny Comfort Toy",
    category: "Toys",
    ageRange: "0–3 Months",
    gender: "Unisex",
    price: 120,
    colors: ["Cream", "Blush"],
    sizes: ["One size"],
    badge: "Cuddle buddy",
    description: "A gentle plush bunny sized for supervised cuddles, pram rides and nursery shelves.",
    palette: ["#f3dfd7", "#f6c5d0", "#fffaf5"],
    icon: "bunny",
  },
  {
    slug: "adventure-mini-backpack",
    name: "Adventure Mini Backpack",
    category: "School Essentials",
    ageRange: "4–6 Years",
    gender: "Unisex",
    price: 275,
    colors: ["Mint", "Lavender", "Ochre"],
    sizes: ["Mini"],
    badge: "Back to school",
    description: "A light, wipe-clean backpack sized for nursery adventures, snacks and treasured finds.",
    palette: ["#a7d8c5", "#d7c4ec", "#d9a54d"],
    icon: "backpack",
  },
  {
    slug: "first-day-lunch-kit",
    name: "First Day Lunch Kit",
    category: "School Essentials",
    ageRange: "4–6 Years",
    gender: "Unisex",
    price: 185,
    colors: ["Blue", "Peach"],
    sizes: ["Bottle + lunch box"],
    badge: "School days",
    description: "A lunch box and matching bottle set with easy-open clips for independent little learners.",
    palette: ["#b9d8f0", "#f4b69d", "#fff7e9"],
    icon: "lunch",
  },
  {
    slug: "dreamy-night-comforter",
    name: "Dreamy Night Comforter",
    category: "Nursery",
    ageRange: "3–6 Months",
    gender: "Unisex",
    price: 135,
    colors: ["Oat", "Blush", "Blue"],
    sizes: ["One size"],
    badge: "Gentle comfort",
    description: "A soft, lightweight comforter designed for supervised cuddles and calm bedtime routines.",
    palette: ["#e7d7c2", "#f2c6ce", "#c8dfeb"],
    icon: "blanket",
  },
  {
    slug: "cloud-cot-sheet-set",
    name: "Cloud Cot Sheet Set",
    category: "Nursery",
    ageRange: "0–3 Months",
    gender: "Unisex",
    price: 230,
    colors: ["White", "Sage"],
    sizes: ["Cot", "Mini cot"],
    badge: "Nursery staple",
    description: "Two breathable fitted cot sheets in soft cotton-rich fabric for restful little nights.",
    palette: ["#f8f8f4", "#c8dcc8", "#dcebf1"],
    icon: "cot",
  },
  {
    slug: "hello-little-one-gift-box",
    name: "Hello Little One Gift Box",
    category: "Gift Sets",
    ageRange: "0–3 Months",
    gender: "Unisex",
    price: 395,
    colors: ["Neutral", "Blush", "Blue"],
    sizes: ["Newborn"],
    badge: "Gift-ready",
    description: "A beautifully presented welcome box with cosy essentials for baby and a keepsake card for family.",
    palette: ["#f2d7cc", "#f7e2aa", "#d8ecf4"],
    icon: "gift",
  },
  {
    slug: "birthday-joy-gift-bundle",
    name: "Birthday Joy Gift Bundle",
    category: "Gift Sets",
    ageRange: "1–2 Years",
    gender: "Unisex",
    price: 320,
    colors: ["Celebration Mix"],
    sizes: ["Bundle"],
    badge: "Party pick",
    description: "A cheerful bundle with a soft toy, outfit accessory and gift card for first birthday moments.",
    palette: ["#f6b5c8", "#f9d66b", "#9bd5cf"],
    icon: "party",
  },
  {
    slug: "everyday-mama-organiser-tote",
    name: "Everyday Mama Organiser Tote",
    category: "Maternity",
    ageRange: "All Ages",
    gender: "Women",
    price: 420,
    colors: ["Black", "Stone", "Olive"],
    sizes: ["One size"],
    badge: "Made for real days",
    description: "A considered changing tote with insulated pockets, a wipe-clean lining and room for parent essentials.",
    palette: ["#232323", "#cfc4b7", "#6e7857"],
    icon: "tote",
  },
  {
    slug: "nursing-cover-and-burp-cloth-set",
    name: "Nursing Cover & Burp Cloth Set",
    category: "Maternity",
    ageRange: "All Ages",
    gender: "Women",
    price: 210,
    colors: ["Oat", "Sage"],
    sizes: ["Cover + 2 cloths"],
    badge: "New parent help",
    description: "A soft nursing cover with two absorbent burp cloths for everyday feeding support.",
    palette: ["#e9decd", "#c4d8c0", "#fff8ec"],
    icon: "cloth",
  },
  {
    slug: "clearance-play-tee-pair",
    name: "Clearance Play Tee Pair",
    category: "Clearance",
    ageRange: "2–4 Years",
    gender: "Unisex",
    price: 95,
    compareAtPrice: 150,
    colors: ["Sun", "Sky"],
    sizes: ["2–3Y", "3–4Y"],
    badge: "Limited deal",
    description: "Two breathable play tees in cheerful colours, priced for quick wardrobe refreshes.",
    palette: ["#f8d66d", "#9fd6ef", "#fff7df"],
    icon: "tee",
  },
];

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function illustration(product) {
  const [a, b, c] = product.palette;
  const name = escapeXml(product.name);
  const category = escapeXml(product.category.toUpperCase());
  const common = `
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="0.55" stop-color="${c}"/><stop offset="1" stop-color="${b}"/></linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#4d372d" flood-opacity="0.16"/></filter>
    </defs>
    <rect width="1200" height="1350" rx="90" fill="url(#bg)"/>
    <circle cx="1000" cy="185" r="165" fill="#fff" opacity="0.35"/>
    <circle cx="185" cy="1120" r="210" fill="#fff" opacity="0.28"/>
    <text x="90" y="115" font-family="Inter, Arial, sans-serif" font-size="38" font-weight="800" letter-spacing="8" fill="#2a201d" opacity="0.52">BAEBE BOO</text>`;
  const footer = `<text x="600" y="1195" font-family="Georgia, serif" font-size="54" font-weight="700" text-anchor="middle" fill="#231f1d">${name}</text><text x="600" y="1265" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800" letter-spacing="6" text-anchor="middle" fill="#231f1d" opacity="0.52">${category}</text>`;
  const color = "#2b2421";
  const cream = "#fffaf2";
  const accent = b;
  const shapes = {
    romper: `<g filter="url(#shadow)"><path d="M420 390c45-55 315-55 360 0l72 120-95 70-45-56v280c0 60-36 96-96 96h-32l-34-118-34 118h-32c-60 0-96-36-96-96V524l-45 56-95-70 72-120z" fill="${cream}"/><circle cx="600" cy="525" r="16" fill="${accent}"/><circle cx="600" cy="600" r="16" fill="${accent}"/></g>`,
    sleepsuit: `<g filter="url(#shadow)"><path d="M405 360h390l45 140-72 46-34-70v345c0 58-34 92-92 92h-84l-24-138-24 138h-84c-58 0-92-34-92-92V476l-34 70-72-46 45-140z" fill="${cream}"/><path d="M600 382v380" stroke="${accent}" stroke-width="18" stroke-linecap="round"/><circle cx="600" cy="455" r="13" fill="${color}" opacity=".35"/></g>`,
    bodysuits: `<g filter="url(#shadow)"><rect x="335" y="480" width="250" height="330" rx="70" fill="${cream}"/><rect x="565" y="430" width="250" height="370" rx="72" fill="#ffffff" opacity=".92"/><rect x="450" y="370" width="280" height="390" rx="76" fill="${accent}" opacity=".88"/><path d="M520 370c20 55 140 55 160 0" fill="none" stroke="#fff" stroke-width="18"/></g>`,
    shoe: `<g filter="url(#shadow)"><path d="M330 725c135-30 190-165 280-190 110-30 170 65 205 130 55 5 95 35 105 91 10 52-24 91-94 101H375c-65 0-105-42-94-84 6-25 21-39 49-48z" fill="${cream}"/><path d="M355 770h505" stroke="${color}" stroke-width="24" stroke-linecap="round" opacity=".28"/><path d="M595 610l135 80" stroke="${accent}" stroke-width="22" stroke-linecap="round"/></g>`,
    sandal: `<g filter="url(#shadow)"><path d="M385 720c82-110 150-198 274-218 102-17 174 28 206 113 22 59 11 136-35 185-54 57-148 80-294 75-104-4-179-25-202-63-19-31 1-61 51-92z" fill="${cream}"/><path d="M480 700c110-32 214-25 326 25M560 585c30 85 67 169 111 251" stroke="${accent}" stroke-width="31" stroke-linecap="round" fill="none"/></g>`,
    feeding: `<g filter="url(#shadow)"><ellipse cx="580" cy="760" rx="230" ry="90" fill="${cream}"/><path d="M360 700h440c-20 138-95 212-220 212s-200-74-220-212z" fill="#fff"/><path d="M770 495c60 105 36 197-74 276" stroke="${accent}" stroke-width="36" fill="none" stroke-linecap="round"/><circle cx="438" cy="566" r="92" fill="${cream}"/><circle cx="438" cy="566" r="55" fill="${accent}" opacity=".65"/></g>`,
    cup: `<g filter="url(#shadow)"><path d="M430 430h300l-34 430c-5 59-47 92-106 92h-20c-59 0-101-33-106-92l-34-430z" fill="${cream}"/><path d="M720 552h80c58 0 94 42 86 99-7 53-44 86-98 86h-60" fill="none" stroke="#fff" stroke-width="38"/><path d="M475 525h210" stroke="${accent}" stroke-width="28" stroke-linecap="round"/></g>`,
    rainbow: `<g filter="url(#shadow)" fill="none" stroke-linecap="round"><path d="M335 790a265 265 0 0 1 530 0" stroke="#ef817f" stroke-width="78"/><path d="M435 790a165 165 0 0 1 330 0" stroke="#f5cf66" stroke-width="72"/><path d="M525 790a75 75 0 0 1 150 0" stroke="#76c6be" stroke-width="66"/><rect x="315" y="785" width="570" height="80" rx="40" fill="${cream}" stroke="none"/></g>`,
    bunny: `<g filter="url(#shadow)"><ellipse cx="520" cy="440" rx="62" ry="150" fill="${cream}" transform="rotate(-18 520 440)"/><ellipse cx="675" cy="440" rx="62" ry="150" fill="${cream}" transform="rotate(18 675 440)"/><circle cx="600" cy="640" r="185" fill="#fff"/><circle cx="535" cy="625" r="16" fill="${color}"/><circle cx="665" cy="625" r="16" fill="${color}"/><path d="M580 690q20 24 40 0" stroke="${accent}" stroke-width="14" fill="none" stroke-linecap="round"/></g>`,
    backpack: `<g filter="url(#shadow)"><rect x="395" y="390" width="410" height="560" rx="115" fill="${cream}"/><rect x="455" y="620" width="290" height="235" rx="55" fill="${accent}" opacity=".82"/><path d="M420 530c-110 70-110 250 0 320M780 530c110 70 110 250 0 320" stroke="#fff" stroke-width="38" fill="none" stroke-linecap="round"/><rect x="500" y="455" width="200" height="52" rx="26" fill="#fff" opacity=".8"/></g>`,
    lunch: `<g filter="url(#shadow)"><rect x="350" y="570" width="500" height="300" rx="60" fill="${cream}"/><rect x="430" y="515" width="340" height="105" rx="52" fill="#fff"/><path d="M500 515v-60c0-45 38-80 100-80s100 35 100 80v60" stroke="${color}" stroke-width="30" fill="none" opacity=".38"/><rect x="435" y="655" width="330" height="55" rx="28" fill="${accent}" opacity=".8"/></g>`,
    blanket: `<g filter="url(#shadow)"><path d="M360 430h480v390c0 80-65 145-145 145H505c-80 0-145-65-145-145V430z" fill="${cream}"/><path d="M360 540c150 85 320-85 480 0M360 690c150 85 320-85 480 0" stroke="${accent}" stroke-width="34" fill="none" opacity=".8"/><circle cx="600" cy="810" r="58" fill="#fff" opacity=".75"/></g>`,
    cot: `<g filter="url(#shadow)"><rect x="300" y="520" width="600" height="330" rx="55" fill="${cream}"/><path d="M345 520v-110M855 520v-110M300 650h600M380 520v330M460 520v330M540 520v330M620 520v330M700 520v330M780 520v330" stroke="${color}" stroke-width="22" opacity=".38"/><path d="M420 420h360" stroke="${accent}" stroke-width="34" stroke-linecap="round"/></g>`,
    gift: `<g filter="url(#shadow)"><rect x="350" y="545" width="500" height="350" rx="55" fill="${cream}"/><rect x="570" y="545" width="60" height="350" fill="${accent}"/><rect x="325" y="470" width="550" height="100" rx="40" fill="#fff"/><path d="M600 470c-92-120-230-82-170 20 45 76 139 11 170-20 31 31 125 96 170 20 60-102-78-140-170-20z" fill="${accent}" opacity=".82"/></g>`,
    party: `<g filter="url(#shadow)"><path d="M600 360l185 525H415L600 360z" fill="${cream}"/><path d="M500 680h200M470 780h260" stroke="${accent}" stroke-width="38" stroke-linecap="round"/><circle cx="420" cy="420" r="38" fill="#fff"/><circle cx="810" cy="570" r="30" fill="#fff"/><circle cx="355" cy="720" r="26" fill="#fff"/></g>`,
    tote: `<g filter="url(#shadow)"><rect x="350" y="500" width="500" height="430" rx="65" fill="${cream}"/><path d="M480 500v-70c0-75 55-130 120-130s120 55 120 130v70" stroke="${color}" stroke-width="35" fill="none" opacity=".5"/><rect x="450" y="650" width="300" height="120" rx="34" fill="${accent}" opacity=".78"/></g>`,
    cloth: `<g filter="url(#shadow)"><path d="M390 410h420v500c-145 70-285-70-420 0V410z" fill="${cream}"/><path d="M465 500h270M465 620h270M465 740h180" stroke="${accent}" stroke-width="30" stroke-linecap="round" opacity=".82"/><circle cx="790" cy="850" r="95" fill="#fff" opacity=".7"/></g>`,
    tee: `<g filter="url(#shadow)"><path d="M420 390l-120 120 92 96 58-55v340h300V551l58 55 92-96-120-120-95 55c-45 30-125 30-170 0l-95-55z" fill="${cream}"/><path d="M510 390c24 55 156 55 180 0" stroke="${accent}" stroke-width="23" fill="none"/><circle cx="600" cy="650" r="70" fill="${accent}" opacity=".72"/></g>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1350" role="img" aria-label="${name}">${common}${shapes[product.icon] || shapes.gift}${footer}</svg>`;
}

function variantOptions(product) {
  const sizes = product.sizes.length ? product.sizes : [undefined];
  const colors = product.colors.length ? product.colors : [undefined];
  const combos = [];
  for (const size of sizes) {
    for (const color of colors) {
      combos.push({ size, color });
      if (combos.length >= 6) return combos;
    }
  }
  return combos;
}

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) {
    console.error(label, JSON.stringify(error, null, 2));
    throw new Error(label);
  }
  return data;
}

async function main() {
  const { data: shops, error: shopError } = await supabase
    .from("shops")
    .select("id,name,location,is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (shopError || !shops?.length) throw new Error("No active shops found.");

  const { error: variantProbeError } = await supabase
    .from("product_variants")
    .select("id")
    .limit(1);
  const normalizedCommerceAvailable = !variantProbeError;

  const existing = await must(
    "load existing seed products",
    supabase.from("products").select("id,sku").like("sku", "BB-SEED-%"),
  );
  const existingIds = existing.map((row) => row.id);
  if (existingIds.length) {
    if (normalizedCommerceAvailable) {
      const variants = await must(
        "load existing seed variants",
        supabase.from("product_variants").select("id").in("product_id", existingIds),
      );
      const variantIds = variants.map((row) => row.id);
      if (variantIds.length) await must("delete seed inventory", supabase.from("inventory_levels").delete().in("variant_id", variantIds));
      await must("delete seed product media", supabase.from("product_media").delete().in("product_id", existingIds));
      if (variantIds.length) await must("delete seed variants", supabase.from("product_variants").delete().in("id", variantIds));
    }
    await must("delete seed availability", supabase.from("product_shop_availability").delete().in("product_id", existingIds));
    await must("delete seed products", supabase.from("products").delete().in("id", existingIds));
  }

  const publicDir = path.join(process.cwd(), "public", "products");
  fs.mkdirSync(publicDir, { recursive: true });

  const created = [];
  for (const [index, product] of products.entries()) {
    const sku = `BB-SEED-${String(index + 1).padStart(3, "0")}`;
    const svg = illustration(product);
    const localPath = path.join(publicDir, `${product.slug}.svg`);
    fs.writeFileSync(localPath, svg);

    const storagePath = `products/seed/${product.slug}.svg`;
    const upload = await supabase.storage
      .from("product-images")
      .upload(storagePath, Buffer.from(svg), {
        contentType: "image/svg+xml; charset=utf-8",
        upsert: true,
      });
    if (upload.error) {
      console.error("upload image", product.slug, upload.error);
      throw new Error(`Could not upload image for ${product.name}`);
    }
    const imageUrl = supabase.storage.from("product-images").getPublicUrl(storagePath).data.publicUrl;

    const productRow = await must(
      "insert product",
      supabase
        .from("products")
        .insert({
          name: product.name,
          description: product.description,
          category: product.category,
          age_range: product.ageRange,
          gender: product.gender,
          sku,
          price: product.price,
          image_url: imageUrl,
          is_active: true,
        })
        .select("id")
        .single(),
    );

    let defaultVariant = null;
    if (normalizedCommerceAvailable) {
      const variantsToInsert = variantOptions(product).map((option, variantIndex) => {
        const titleParts = [option.color, option.size].filter(Boolean);
        return {
          product_id: productRow.id,
          sku: `${sku}-${String(variantIndex + 1).padStart(2, "0")}`,
          title: titleParts.join(" / ") || product.name,
          option_values: Object.fromEntries(Object.entries({ color: option.color, size: option.size }).filter(([, value]) => value)),
          price: product.price,
          compare_at_price: variantIndex === 0 && product.compareAtPrice ? product.compareAtPrice : null,
          is_default: variantIndex === 0,
          is_active: true,
        };
      });
      const variantRows = await must(
        "insert variants",
        supabase.from("product_variants").insert(variantsToInsert).select("id,is_default"),
      );
      defaultVariant = variantRows.find((variant) => variant.is_default) || variantRows[0];

      await must(
        "insert product media",
        supabase.from("product_media").insert({
          product_id: productRow.id,
          variant_id: null,
          media_type: "image",
          url: imageUrl,
          alt_text: `${product.name} product image`,
          width: 1200,
          height: 1350,
          sort_order: 0,
          is_active: true,
        }),
      );

      const inventoryRows = [];
      for (const variant of variantRows) {
        for (const [shopIndex, shop] of shops.entries()) {
          inventoryRows.push({
            variant_id: variant.id,
            shop_id: shop.id,
            on_hand: Math.max(3, 5 + ((index + 3) * (shopIndex + 2)) % 13),
            reserved: 0,
            reorder_point: 2,
          });
        }
      }
      await must("insert inventory", supabase.from("inventory_levels").insert(inventoryRows));
    }

    const availabilityRows = shops.map((shop, shopIndex) => ({
      product_id: productRow.id,
      shop_id: shop.id,
      stock_quantity: 8 + ((index + 1) * (shopIndex + 2)) % 17,
      is_available: true,
    }));
    await must("insert legacy availability", supabase.from("product_shop_availability").insert(availabilityRows));

    created.push({
      id: productRow.id,
      sku,
      name: product.name,
      category: product.category,
      imageUrl,
      defaultVariantId: defaultVariant?.id || null,
    });
  }

  const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true);
  console.log(JSON.stringify({
    activeShops: shops.map((shop) => `${shop.name} (${shop.location})`),
    createdProducts: created.length,
    activeProductCountAfterSeed: count,
    products: created.map(({ sku, name, category }) => ({ sku, name, category })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
