/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Gives every seeded product a usable gallery.
 *
 * The storefront only renders a thumbnail rail when a product has more than one
 * distinct media URL, and each seeded product ships with exactly one photo —
 * Carter's blocks fetching their alternate views (alternate filenames 404, their
 * product pages 403). So we derive square DETAIL CROPS from the photo we already
 * have and store them as additional media.
 *
 * These are crops of the same photograph, not different camera angles, and the
 * alt text says so. Replace them with genuine photos through the admin uploader
 * whenever real ones are available.
 *
 * Safe to re-run: it removes only the crops it previously created (matched by the
 * gallery/ storage path) and leaves the primary product image untouched.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { createClient } = require("@supabase/supabase-js");

function loadEnv(file) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    process.env[trimmed.slice(0, index).trim()] =
      trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
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

const bucket = "product-images";
const galleryPrefix = "products/seed/carters/gallery";
const localImageDir = path.join(process.cwd(), "public", "products", "carters");

/**
 * Two square close-ups: one anchored near the top of the frame, one near the
 * bottom. On the catalog's 900x1125 photos this reliably yields a collar/label
 * shot and a hem/feet shot — visibly different parts of the same garment.
 */
const crops = [
  { key: "detail-top", label: "detail view (upper)", anchor: "top" },
  { key: "detail-lower", label: "detail view (lower)", anchor: "bottom" },
];

const cropScale = 0.65; // square side, as a fraction of image width
const cropMargin = 0.06; // inset from the anchored edge, as a fraction of height

async function derivedCrop(sourcePath, anchor) {
  const { width, height } = await sharp(sourcePath).metadata();
  const size = Math.min(Math.round(width * cropScale), width, height);
  const margin = Math.min(Math.round(height * cropMargin), Math.max(0, height - size));
  const top = anchor === "top" ? margin : Math.max(0, height - size - margin);
  return sharp(sourcePath)
    .extract({ left: Math.round((width - size) / 2), top, width: size, height: size })
    .resize(900, 900, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toBuffer();
}

function slugFromImageUrl(url) {
  const file = String(url || "").split("/").pop() || "";
  return file.replace(/\.[a-z0-9]+$/i, "");
}

async function main() {
  const { data: products, error } = await supabase
    .from("products")
    .select("id,name,sku,image_url")
    .like("sku", "BB-SEED-%")
    .order("sku");
  if (error) throw new Error(`Could not load seed products: ${error.message}`);
  if (!products?.length) throw new Error("No BB-SEED-% products found.");

  const summary = [];
  for (const product of products) {
    const slug = slugFromImageUrl(product.image_url);
    const sourcePath = path.join(localImageDir, `${slug}.jpg`);
    if (!slug || !fs.existsSync(sourcePath)) {
      summary.push({ sku: product.sku, skipped: `no local image for "${slug}"` });
      continue;
    }

    // Drop any crops from a previous run so re-running cannot stack duplicates.
    const { error: cleanupError } = await supabase
      .from("product_media")
      .delete()
      .eq("product_id", product.id)
      .like("url", `%/${galleryPrefix}/%`);
    if (cleanupError) throw new Error(`Cleanup failed for ${product.sku}: ${cleanupError.message}`);

    const rows = [];
    for (const [index, crop] of crops.entries()) {
      const buffer = await derivedCrop(sourcePath, crop.anchor);
      const storagePath = `${galleryPrefix}/${slug}-${crop.key}.jpg`;
      const upload = await supabase.storage
        .from(bucket)
        .upload(storagePath, buffer, { contentType: "image/jpeg", upsert: true });
      if (upload.error) throw new Error(`Upload failed for ${storagePath}: ${upload.error.message}`);

      rows.push({
        product_id: product.id,
        variant_id: null,
        media_type: "image",
        url: supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl,
        alt_text: `${product.name} — ${crop.label}`,
        sort_order: index + 1,
        is_active: true,
      });
    }

    const { error: insertError } = await supabase.from("product_media").insert(rows);
    if (insertError) throw new Error(`Media insert failed for ${product.sku}: ${insertError.message}`);
    summary.push({ sku: product.sku, name: product.name, cropsAdded: rows.length });
  }

  console.log(JSON.stringify({
    bucket,
    galleryPrefix,
    productsProcessed: summary.length,
    note: "Crops are re-framings of each product's existing photo, not alternate angles.",
    summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
