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
    slug: "baby-girl-bear-fleece-zip-up-hoodie",
    name: "Baby Girl Bear Fleece Zip-Up Hoodie - Pink",
    category: "Baby Clothing",
    ageRange: "3–6 Months",
    gender: "Girls",
    price: 245,
    compareAtPrice: 320,
    colors: ["Pink"],
    sizes: ["3M", "6M", "9M", "12M"],
    description: "A cosy Carter's fleece zip hoodie with bear-ear detail for cool mornings and travel days.",
    imageSource: "https://dw.cartersstorefront.com/dw/image/v2/AAMK_PRD/on/demandware.static/-/Sites-carters_master_catalog/default/dw4499551e/productimages/1W102610.jpg?sw=900",
  },
  {
    slug: "baby-girl-fleece-pants-pink",
    name: "Baby Girl Fleece Pants - Pink",
    category: "Baby Clothing",
    ageRange: "3–6 Months",
    gender: "Girls",
    price: 160,
    compareAtPrice: 210,
    colors: ["Pink"],
    sizes: ["3M", "6M", "9M", "12M"],
    description: "Soft Carter's pull-on fleece pants for easy everyday outfits.",
    imageSource: "https://dw.cartersstorefront.com/dw/image/v2/AAMK_PRD/on/demandware.static/-/Sites-carters_master_catalog/default/dw2813a401/productimages/1W376110.jpg?sw=900",
  },
  {
    slug: "baby-boy-bear-fleece-zip-up-hoodie",
    name: "Baby Boy Bear Fleece Zip-Up Hoodie - Navy Blue",
    category: "Baby Clothing",
    ageRange: "3–6 Months",
    gender: "Boys",
    price: 245,
    compareAtPrice: 320,
    colors: ["Navy Blue"],
    sizes: ["3M", "6M", "9M", "12M"],
    description: "A warm Carter's bear fleece hoodie with an easy front zip.",
    imageSource: "https://dw.cartersstorefront.com/dw/image/v2/AAMK_PRD/on/demandware.static/-/Sites-carters_master_catalog/default/dwff65fab9/productimages/1W103210.jpg?sw=900",
  },
  {
    slug: "baby-five-pack-sleeveless-bodysuits",
    name: "Baby 5-Pack Sleeveless Bodysuits - White",
    category: "Baby Clothing",
    ageRange: "0–3 Months",
    gender: "Unisex",
    price: 260,
    colors: ["White"],
    sizes: ["Newborn", "3M", "6M", "9M"],
    description: "A Carter's five-pack of breathable sleeveless bodysuits for layering and warm weather.",
    imageSource: "https://dw.cartersstorefront.com/dw/image/v2/AAMK_PRD/on/demandware.static/-/Sites-carters_master_catalog/default/dw3d759771/productimages/1L930410.jpg?sw=900",
  },
  {
    slug: "baby-organic-cotton-sweater-knit-jumpsuit",
    name: "Baby Organic Cotton Sweater Knit Jumpsuit",
    category: "Baby Clothing",
    ageRange: "0–3 Months",
    gender: "Unisex",
    price: 395,
    colors: ["Cream"],
    sizes: ["Newborn", "3M", "6M"],
    description: "A soft Carter's organic cotton sweater-knit jumpsuit for gifting and first outings.",
    imageSource: "https://dw.cartersstorefront.com/dw/image/v2/AAMK_PRD/on/demandware.static/-/Sites-carters_master_catalog/default/dwf6124d92/productimages/1W165010.jpg?sw=900",
  },
  {
    slug: "baby-girl-strawberry-cotton-sleep-play-pajamas",
    name: "Baby Girl Strawberry 100% Cotton 2-Way Zip Sleep & Play Pajamas - Pink",
    category: "Baby Clothing",
    ageRange: "0–3 Months",
    gender: "Girls",
    price: 210,
    colors: ["Pink"],
    sizes: ["Newborn", "3M", "6M", "9M"],
    description: "Carter's cotton sleep-and-play pajamas with a practical 2-way zip.",
    imageSource: "https://dw.cartersstorefront.com/dw/image/v2/AAMK_PRD/on/demandware.static/-/Sites-carters_master_catalog/default/dwf3d8b467/productimages/1V245610.jpg?sw=900",
  },
  {
    slug: "baby-girl-bow-moccasin-shoes",
    name: "Baby Girl Bow Mocassin Shoes - Tan",
    category: "Baby Shoes",
    ageRange: "6–12 Months",
    gender: "Girls",
    price: 220,
    colors: ["Tan"],
    sizes: ["0–3M", "3–6M", "6–9M", "9–12M"],
    description: "Dressy Carter's baby moccasins with a bow detail and soft sole.",
    imageSource: "https://dw.cartersstorefront.com/dw/image/v2/AAMK_PRD/on/demandware.static/-/Sites-carters_master_catalog/default/dwb415787d/productimages/CR08867.jpg?sw=900",
  },
  {
    slug: "baby-girl-every-step-shimmer-heart-sneakers",
    name: "Baby Girl Every Step® First Walker Shimmer Heart Sneakers - White/Pink",
    category: "Baby Shoes",
    ageRange: "1–2 Years",
    gender: "Girls",
    price: 295,
    colors: ["White/Pink"],
    sizes: ["3", "4", "5", "6"],
    description: "Carter's Every Step first-walker sneakers with a shimmer heart design.",
    imageSource: "https://dw.cartersstorefront.com/dw/image/v2/AAMK_PRD/on/demandware.static/-/Sites-carters_master_catalog/default/dw55eed4a3/productimages/EF26A07H.jpg?sw=900",
  },
  {
    slug: "baby-boy-every-step-first-walker-sneakers",
    name: "Baby Boy Every Step® First Walker Sneakers - Tan",
    category: "Baby Shoes",
    ageRange: "1–2 Years",
    gender: "Boys",
    price: 295,
    colors: ["Tan"],
    sizes: ["3", "4", "5", "6"],
    description: "Supportive Carter's first-walker sneakers with an easy hook-and-loop strap.",
    imageSource: "https://dw.cartersstorefront.com/dw/image/v2/AAMK_PRD/on/demandware.static/-/Sites-carters_master_catalog/default/dw5f360752/productimages/EF26A04H.jpg?sw=900",
  },
  {
    slug: "farmstand-teether-play-baby-toy",
    name: "Farmstand Teether & Play Baby Toy",
    category: "Toys",
    ageRange: "3–6 Months",
    gender: "Unisex",
    price: 145,
    colors: ["Multicolor"],
    sizes: ["One size"],
    description: "A Carter's baby teether and play toy designed for grasping, chewing and sensory play.",
    imageSource: "https://dw.cartersstorefront.com/dw/image/v2/AAMK_PRD/on/demandware.static/-/Sites-carters_master_catalog/default/dw5c178ab4/productimages/9R257910_4.jpg?sw=900",
  },
  {
    slug: "explore-more-selfie-phone",
    name: "Explore & More Selfie Phone",
    category: "Toys",
    ageRange: "6–12 Months",
    gender: "Unisex",
    price: 180,
    colors: ["Multicolor"],
    sizes: ["One size"],
    description: "A playful Carter's/Skip Hop baby phone toy for early pretend play and textures.",
    imageSource: "https://dw.cartersstorefront.com/dw/image/v2/AAMK_PRD/on/demandware.static/-/Sites-carters_master_catalog/default/dwf6e1ecfe/productimages/185650.jpg?sw=900",
  },
  {
    slug: "zoo-stack-pour-buckets-bath-toy",
    name: "Zoo Stack & Pour Buckets Baby Bath Toy",
    category: "Toys",
    ageRange: "1–2 Years",
    gender: "Unisex",
    price: 175,
    colors: ["Multicolor"],
    sizes: ["Set"],
    description: "Carter's/Skip Hop stacking and pouring buckets for bath-time play.",
    imageSource: "https://dw.cartersstorefront.com/dw/image/v2/AAMK_PRD/on/demandware.static/-/Sites-carters_master_catalog/default/dwa0dff7f8/productimages/9O277410.jpg?sw=900",
  },
  {
    slug: "baby-little-planet-silicone-wood-teether",
    name: "Baby Little Planet Silicone & Wood Teether - Pink",
    category: "Feeding",
    ageRange: "3–6 Months",
    gender: "Unisex",
    price: 95,
    colors: ["Pink/Natural"],
    sizes: ["One size"],
    description: "A Carter's Little Planet teether with silicone and wood textures for sore gums.",
    imageSource: "https://dw.cartersstorefront.com/dw/image/v2/AAMK_PRD/on/demandware.static/-/Sites-carters_master_catalog/default/dw18563d01/productimages/9Q334010.jpg?sw=900",
  },
  {
    slug: "baby-elephant-striped-sleep-play-two-pack",
    name: "Baby 2-Pack Elephant Striped 100% Cotton 2-Way Zip Sleep & Play Pajamas - Ivory/Grey",
    category: "Gift Sets",
    ageRange: "0–3 Months",
    gender: "Unisex",
    price: 330,
    colors: ["Ivory/Grey"],
    sizes: ["Newborn", "3M", "6M"],
    description: "A Carter's two-pack sleep-and-play set that works well as a newborn gift.",
    imageSource: "https://dw.cartersstorefront.com/dw/image/v2/AAMK_PRD/on/demandware.static/-/Sites-carters_master_catalog/default/dwfe5abf52/productimages/1V398010.jpg?sw=900",
  },
  {
    slug: "baby-five-pack-elephant-multipack-bodysuits",
    name: "Baby 5-Pack Elephant Multipack Bodysuits",
    category: "Gift Sets",
    ageRange: "0–3 Months",
    gender: "Unisex",
    price: 285,
    colors: ["Multipack"],
    sizes: ["Newborn", "3M", "6M", "9M"],
    description: "A Carter's multipack of elephant bodysuits for practical baby gifting.",
    imageSource: "https://dw.cartersstorefront.com/dw/image/v2/AAMK_PRD/on/demandware.static/-/Sites-carters_master_catalog/default/dw3d51b9b3/productimages/1V242710.jpg?sw=900",
  },
  {
    slug: "toddler-girl-two-piece-short-sleeve-top-pant-set",
    name: "Toddler Girl 2-Piece Short-Sleeve Top & Pant Set - Pink",
    category: "School Essentials",
    ageRange: "2–4 Years",
    gender: "Girls",
    price: 260,
    colors: ["Pink"],
    sizes: ["2T", "3T", "4T"],
    description: "A Carter's toddler outfit set for nursery, play dates and easy mornings.",
    imageSource: "https://dw.cartersstorefront.com/dw/image/v2/AAMK_PRD/on/demandware.static/-/Sites-carters_master_catalog/default/dw048af641/productimages/2V632010.jpg?sw=900",
  },
  {
    slug: "toddler-boy-denim-classic-jeans",
    name: "Toddler Boy Denim Classic Jeans - Light Wash",
    category: "School Essentials",
    ageRange: "2–4 Years",
    gender: "Boys",
    price: 240,
    colors: ["Light Wash"],
    sizes: ["2T", "3T", "4T", "5T"],
    description: "Carter's toddler denim jeans with a classic light wash for everyday wear.",
    imageSource: "https://dw.cartersstorefront.com/dw/image/v2/AAMK_PRD/on/demandware.static/-/Sites-carters_master_catalog/default/dw39af79ae/productimages/6V959510.jpg?sw=900",
  },
  {
    slug: "baby-four-piece-elephant-long-sleeve-set",
    name: "Baby 4-Piece Elephant Long-Sleeve Bodysuit & Pant Set - Grey",
    category: "Nursery",
    ageRange: "0–3 Months",
    gender: "Unisex",
    price: 360,
    colors: ["Grey/Ivory"],
    sizes: ["Newborn", "3M", "6M"],
    description: "A Carter's four-piece elephant set suitable for hospital bag, nursery and first weeks.",
    imageSource: "https://dw.cartersstorefront.com/dw/image/v2/AAMK_PRD/on/demandware.static/-/Sites-carters_master_catalog/default/dw30686177/productimages/1V396710.jpg?sw=900",
  },
];

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) {
    console.error(label, JSON.stringify(error, null, 2));
    throw new Error(label);
  }
  return data;
}

function extensionFromResponse(response, fallbackUrl) {
  const type = response.headers.get("content-type") || "";
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  const clean = fallbackUrl.split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) return "png";
  if (clean.endsWith(".webp")) return "webp";
  if (clean.endsWith(".gif")) return "gif";
  return "jpg";
}

function contentTypeFor(extension) {
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return "image/jpeg";
}

async function downloadProductImage(product) {
  const response = await fetch(product.imageSource, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; BaebeBooCatalogSeeder/1.0)",
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      referer: "https://www.carters.com/",
    },
  });
  if (!response.ok) throw new Error(`Could not download ${product.name}: HTTP ${response.status}`);
  const extension = extensionFromResponse(response, product.imageSource);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1_000) throw new Error(`Downloaded image for ${product.name} was too small.`);
  return { buffer, extension, contentType: contentTypeFor(extension) };
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

async function main() {
  const { data: shops, error: shopError } = await supabase
    .from("shops")
    .select("id,name,location,is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (shopError || !shops?.length) throw new Error("No active shops found.");

  const { error: variantProbeError } = await supabase.from("product_variants").select("id").limit(1);
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

  const publicDir = path.join(process.cwd(), "public", "products", "carters");
  fs.rmSync(path.join(process.cwd(), "public", "products"), { recursive: true, force: true });
  fs.mkdirSync(publicDir, { recursive: true });

  const created = [];
  for (const [index, product] of products.entries()) {
    const sku = `BB-SEED-${String(index + 1).padStart(3, "0")}`;
    const { buffer, extension, contentType } = await downloadProductImage(product);
    const fileName = `${product.slug}.${extension}`;
    const localPath = path.join(publicDir, fileName);
    fs.writeFileSync(localPath, buffer);

    const storagePath = `products/seed/carters/${fileName}`;
    const upload = await supabase.storage
      .from("product-images")
      .upload(storagePath, buffer, { contentType, upsert: true });
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
          description: `${product.description} Image and product reference sourced from Carter's (${product.imageSource.split("?")[0]}).`,
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
          alt_text: `${product.name} Carter's product image`,
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

    created.push({ id: productRow.id, sku, name: product.name, category: product.category, imageUrl, defaultVariantId: defaultVariant?.id || null });
  }

  const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true);
  console.log(JSON.stringify({
    source: "https://www.carters.com",
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
