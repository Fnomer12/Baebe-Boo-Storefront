#!/usr/bin/env node
/**
 * Create and tear down QA fixtures for end-to-end verification.
 *
 * WHY THIS IS SHAPED THIS WAY
 * ---------------------------
 * There is no staging database. `.env.development.local` says so in capitals:
 * the only Supabase project is production, so `npm run dev` and every Playwright
 * run write to the real store — real orders, real stock, real customers.
 *
 * That makes "just create some test data" dangerous, so everything here obeys
 * three rules:
 *
 *   1. **Every fixture is prefixed `ZZQA`.** Shops, staff, products, customers.
 *      The prefix is the teardown key and it sorts last, so fixtures never
 *      appear at the top of an admin list a real person is looking at.
 *   2. **Teardown only ever deletes rows it can prove it created** — matched on
 *      that prefix, never on "recently created" or a blanket truncate.
 *   3. **Nothing here updates a pre-existing row.** If a fixture name is
 *      already taken the script reuses that row rather than mutating anything
 *      it did not make.
 *
 * Usage:
 *   node scripts/qa/fixtures.mjs create     # idempotent; writes .qa-fixtures.json
 *   node scripts/qa/fixtures.mjs list       # show what exists right now
 *   node scripts/qa/fixtures.mjs teardown   # remove everything prefixed ZZQA
 *
 * Credentials land in .qa-fixtures.json (gitignored by the `.env*`-style rules
 * — see the explicit entry added to .gitignore). Playwright reads that file.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixturesPath = resolve(root, ".qa-fixtures.json");

export const QA_PREFIX = "ZZQA";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function loadEnv() {
  for (const file of [".env.development.local", ".env.production"]) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    for (const rawLine of readFileSync(path, "utf8").split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Thin PostgREST / GoTrue helpers
// ---------------------------------------------------------------------------

async function rest(path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: init.prefer ?? "return=representation",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${init.method || "GET"} ${path} → ${response.status} ${text}`);
  }
  return body;
}

async function gotrue(path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${init.method || "GET"} auth/${path} → ${response.status} ${text}`);
  }
  return body;
}

/**
 * Mirrors `src/lib/auth/login-domains.ts`.
 *
 * Kept as a local copy on purpose: that module is TypeScript inside the Next
 * build and this is a plain Node script. It derives the host the same way, so
 * fixtures are provisioned under the address the login pages try FIRST rather
 * than the legacy `.local` one — otherwise the fixtures would only ever
 * exercise the fallback path and never the real one.
 */
function siteHost() {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (!raw) return "baebe-boo.jtechinnovations.tech";
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase();
    return (host.startsWith("www.") ? host.slice(4) : host) || "baebe-boo.jtechinnovations.tech";
  } catch {
    return "baebe-boo.jtechinnovations.tech";
  }
}

function counterEmailForCode(staffCode) {
  return `${String(staffCode).trim().toLowerCase()}@counter.${siteHost()}`;
}

function adminEmailForUsername(username) {
  return `${String(username).trim().toLowerCase()}@admin.${siteHost()}`;
}

/** Both addresses a given staff code could have been provisioned under. */
function counterEmailCandidates(staffCode) {
  const code = String(staffCode).trim().toLowerCase();
  return [...new Set([`${code}@counter.${siteHost()}`, `${code}@counter.baebe-boo.local`])];
}

function password() {
  // Printed once, stored in .qa-fixtures.json, never reused across runs.
  return `Qa!${randomBytes(12).toString("base64url")}`;
}

function staffCode(suffix) {
  return `${QA_PREFIX}${suffix}`;
}

async function findAuthUser(email) {
  const target = email.toLowerCase();
  // GoTrue's admin list has no exact-email filter, and this project has a
  // handful of users, so one page is enough.
  const page = await gotrue("admin/users?per_page=200");
  const users = page.users || (Array.isArray(page) ? page : []);
  return users.find((user) => (user.email || "").toLowerCase() === target) || null;
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

async function ensureShop(name, location) {
  const existing = await rest(`shops?select=id,name,is_active&name=eq.${encodeURIComponent(name)}`);
  if (existing.length > 0) {
    // A reused shop must be live: an inactive shop is invisible under RLS, so
    // its cashier signs in and is told they have no counter, and the product
    // wizard's shop list omits it.
    if (existing[0].is_active === false) {
      await rest(`shops?id=eq.${existing[0].id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: true }),
      });
    }
    return existing[0];
  }
  const [shop] = await rest("shops", {
    method: "POST",
    body: JSON.stringify({
      name,
      location,
      database_name: name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
      is_active: true,
    }),
  });
  return shop;
}

async function ensureCounterStaff({ shopId, name, code }) {
  const email = counterEmailForCode(code);
  const secret = password();

  const existing = await rest(
    `shop_staff?select=id,staff_code,auth_user_id&staff_code=eq.${encodeURIComponent(code)}`,
  );

  let staff = existing[0];
  if (!staff) {
    [staff] = await rest("shop_staff", {
      method: "POST",
      body: JSON.stringify({
        shop_id: shopId,
        staff_name: name,
        staff_contact: "000",
        staff_code: code,
        is_active: true,
      }),
    });
  }

  // staff_authorizations is what `is_authorized_counter` (and therefore the
  // restored RLS policy on shop_staff) checks. Without it the cashier can hold
  // a valid password and still be refused at the till.
  await rest("staff_authorizations", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify({ email, staff_id: staff.id, active: true }),
  });

  let authUser = await findAuthUser(email);
  if (authUser) {
    await gotrue(`admin/users/${authUser.id}`, {
      method: "PUT",
      body: JSON.stringify({ password: secret, email_confirm: true }),
    });
  } else {
    authUser = await gotrue("admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password: secret,
        email_confirm: true,
        app_metadata: { counter_staff_id: staff.id },
      }),
    });
  }

  await rest(`shop_staff?id=eq.${staff.id}`, {
    method: "PATCH",
    body: JSON.stringify({ auth_user_id: authUser.id }),
  });

  return { id: staff.id, name, code, email, password: secret, shopId, authUserId: authUser.id };
}

/**
 * A product with a real option matrix, stocked at one shop only.
 *
 * Two things need proving at the till and both need this shape:
 *   - a 4-variant product must render as ONE card, not four identical ones
 *   - a product stocked at Alpha must not appear at Beta
 *
 * Colours × sizes, `option_values` keyed lowercase, title "Colour / Size" —
 * the same contract scripts/seed-baebe-products.js writes, so the fixtures
 * exercise the real shape rather than an idealised one.
 */
async function ensureVariableProduct({ sku, name, shopId, colors, sizes, price }) {
  const existing = await rest(`products?select=id&sku=eq.${encodeURIComponent(sku)}`);
  if (existing.length > 0) {
    await rest(`products?id=eq.${existing[0].id}`, { method: "DELETE" });
  }

  const [product] = await rest("products", {
    method: "POST",
    body: JSON.stringify({
      name,
      description: "QA fixture. Safe to delete.",
      category: "Baby Clothing",
      age_range: "0–3 Months",
      gender: "Unisex",
      sku,
      price,
      is_active: true,
    }),
  });

  const combos = [];
  for (const color of colors) {
    for (const size of sizes) combos.push({ color, size });
  }

  const variants = await rest("product_variants", {
    method: "POST",
    body: JSON.stringify(
      combos.map((combo, index) => ({
        product_id: product.id,
        sku: `${sku}-${String(index + 1).padStart(2, "0")}`,
        title: `${combo.color} / ${combo.size}`,
        option_values: { color: combo.color, size: combo.size },
        // Deliberately not all the same: a per-variant price is exactly what
        // the admin could not set before, so the fixtures must carry one.
        price: price + index * 5,
        is_default: index === 0,
        is_active: true,
      })),
    ),
  });

  await rest("inventory_levels", {
    method: "POST",
    body: JSON.stringify(
      variants.map((variant) => ({
        variant_id: variant.id,
        shop_id: shopId,
        on_hand: 7,
        reserved: 0,
        reorder_point: 2,
      })),
    ),
  });

  await rest("product_shop_availability", {
    method: "POST",
    body: JSON.stringify({
      product_id: product.id,
      shop_id: shopId,
      stock_quantity: variants.length * 7,
      is_available: true,
    }),
  });

  return { id: product.id, sku, name, variantCount: variants.length, shopId };
}

async function ensureAdmin(username) {
  const email = adminEmailForUsername(username);
  const secret = password();

  let authUser = await findAuthUser(email);
  if (authUser) {
    await gotrue(`admin/users/${authUser.id}`, {
      method: "PUT",
      body: JSON.stringify({ password: secret, email_confirm: true }),
    });
  } else {
    authUser = await gotrue("admin/users", {
      method: "POST",
      body: JSON.stringify({ email, password: secret, email_confirm: true }),
    });
  }

  // `is_admin()` reads admin_users by JWT email, so the auth user alone is not
  // enough — this row is what actually grants the portal.
  //
  // `on_conflict=email` is required: PostgREST only infers the conflict target
  // when it is the primary key, and here `email` is merely unique.
  await rest("admin_users?on_conflict=email", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify({ email, role: "boss", is_active: true }),
  });

  return { email, password: secret, authUserId: authUser.id };
}

async function create() {
  console.log("Creating QA fixtures (everything prefixed ZZQA)…\n");

  const shopA = await ensureShop(`${QA_PREFIX} Shop Alpha`, `${QA_PREFIX} Alpha Road`);
  const shopB = await ensureShop(`${QA_PREFIX} Shop Beta`, `${QA_PREFIX} Beta Road`);
  console.log(`  shop   ${shopA.name}  ${shopA.id}`);
  console.log(`  shop   ${shopB.name}  ${shopB.id}`);

  // Two cashiers at *different* shops is the whole point: it is the only way to
  // prove the counter shows each of them their own shop rather than row 1 of
  // shop_staff.
  const cashierA = await ensureCounterStaff({
    shopId: shopA.id,
    name: `${QA_PREFIX} Cashier Alpha`,
    code: staffCode("AAAA01"),
  });
  const cashierB = await ensureCounterStaff({
    shopId: shopB.id,
    name: `${QA_PREFIX} Cashier Beta`,
    code: staffCode("BBBB02"),
  });
  console.log(`  staff  ${cashierA.name}  ${cashierA.code}  @ Alpha`);
  console.log(`  staff  ${cashierB.name}  ${cashierB.code}  @ Beta`);

  const admin = await ensureAdmin("zzqa-admin");
  console.log(`  admin  ${admin.email}`);

  // Stocked at Alpha ONLY, so Beta's till proves shop scoping by not showing it.
  const variableProduct = await ensureVariableProduct({
    sku: `${QA_PREFIX}-VAR-001`,
    name: `${QA_PREFIX} Bear Hoodie`,
    shopId: shopA.id,
    colors: ["Pink", "Blue"],
    sizes: ["3M", "6M"],
    price: 120,
  });
  const simpleProduct = await ensureVariableProduct({
    sku: `${QA_PREFIX}-SIMPLE-001`,
    name: `${QA_PREFIX} Cotton Bib`,
    shopId: shopA.id,
    colors: ["White"],
    sizes: ["One size"],
    price: 35,
  });
  console.log(`  product ${variableProduct.sku}  ${variableProduct.variantCount} versions @ Alpha`);
  console.log(`  product ${simpleProduct.sku}  ${simpleProduct.variantCount} version  @ Alpha`);

  const fixtures = {
    createdAt: new Date().toISOString(),
    prefix: QA_PREFIX,
    shops: { alpha: shopA, beta: shopB },
    counter: { alpha: cashierA, beta: cashierB },
    admin,
    products: { variable: variableProduct, simple: simpleProduct },
  };
  writeFileSync(fixturesPath, `${JSON.stringify(fixtures, null, 2)}\n`);
  console.log(`\nWrote ${fixturesPath}`);
  console.log("Run `node scripts/qa/fixtures.mjs teardown` when finished.");
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

async function list() {
  const shops = await rest(`shops?select=id,name,location&name=like.${QA_PREFIX}*`);
  const staff = await rest(`shop_staff?select=id,staff_name,staff_code,shop_id&staff_code=like.${QA_PREFIX}*`);
  // Mirror teardown's matcher exactly, or `list` reassures you that something
  // is gone when teardown would in fact still be about to delete it.
  const productsBySku = await rest(`products?select=id,name,sku&sku=like.${QA_PREFIX}*`);
  const productsByName = await rest(`products?select=id,name,sku&name=like.${QA_PREFIX}*`);
  const products = [
    ...new Map([...productsBySku, ...productsByName].map((row) => [row.id, row])).values(),
  ];
  const promotions = await rest(
    `promotions?select=id,name,status,automatic&name=like.${QA_PREFIX}*`,
  );
  console.log(`shops:    ${shops.length}`);
  for (const shop of shops) console.log(`  ${shop.id}  ${shop.name}`);
  console.log(`staff:    ${staff.length}`);
  for (const row of staff) console.log(`  ${row.id}  ${row.staff_code}  ${row.staff_name}`);
  console.log(`products: ${products.length}`);
  for (const row of products) console.log(`  ${row.id}  ${row.sku}  ${row.name}`);
  console.log(`promos:   ${promotions.length}`);
  // Status and automatic are printed because they are the whole risk: an
  // `active` + `automatic` fixture discounts every real order in the shop.
  for (const row of promotions) {
    const live = row.status === "active" && row.automatic;
    console.log(
      `  ${row.id}  ${row.name}  [${row.status}${row.automatic ? ", automatic" : ""}]` +
        (live ? "  <-- LIVE ON REAL ORDERS" : ""),
    );
  }
}

// ---------------------------------------------------------------------------
// teardown
// ---------------------------------------------------------------------------

async function teardown() {
  console.log("Removing QA fixtures…\n");

  // Order matters: children before parents, because the FKs that are not
  // ON DELETE CASCADE will otherwise refuse.
  // By SKU **or** name: a product created through the admin wizard gets an
  // auto-generated SKU (CL-…), so matching on SKU alone would strand it in the
  // live catalogue for ever.
  const bySku = await rest(`products?select=id&sku=like.${QA_PREFIX}*`);
  const byName = await rest(`products?select=id&name=like.${QA_PREFIX}*`);
  const products = [...new Map([...bySku, ...byName].map((row) => [row.id, row])).values()];
  for (const product of products) {
    await rest(`product_shop_availability?product_id=eq.${product.id}`, { method: "DELETE" });
    // product_variants, product_media and inventory_levels all cascade from
    // products, so the product delete alone cleans them up.
    await rest(`products?id=eq.${product.id}`, { method: "DELETE" });
  }
  console.log(`  products             ${products.length}`);

  const staff = await rest(`shop_staff?select=id,staff_code,auth_user_id&staff_code=like.${QA_PREFIX}*`);
  for (const row of staff) {
    await rest(`staff_authorizations?staff_id=eq.${row.id}`, { method: "DELETE" });
    await rest(`shop_staff?id=eq.${row.id}`, { method: "DELETE" });
    if (row.auth_user_id) {
      await gotrue(`admin/users/${row.auth_user_id}`, { method: "DELETE" }).catch(() => {});
    }
    // A fixture created before the sign-in domain changed lives under `.local`
    // and is no longer the row's auth_user_id, so it would be orphaned.
    for (const email of counterEmailCandidates(row.staff_code)) {
      const stale = await findAuthUser(email);
      if (stale && stale.id !== row.auth_user_id) {
        await gotrue(`admin/users/${stale.id}`, { method: "DELETE" }).catch(() => {});
      }
    }
  }
  console.log(`  staff                ${staff.length}`);

  const shops = await rest(`shops?select=id&name=like.${QA_PREFIX}*`);
  for (const shop of shops) {
    await rest(`inventory_levels?shop_id=eq.${shop.id}`, { method: "DELETE" });
    await rest(`product_shop_availability?shop_id=eq.${shop.id}`, { method: "DELETE" });
    await rest(`shops?id=eq.${shop.id}`, { method: "DELETE" });
  }
  console.log(`  shops                ${shops.length}`);

  const promotions = await rest(`promotions?select=id,name&name=like.${QA_PREFIX}*`);
  let deletedPromotions = 0;
  let strandedPromotions = 0;
  for (const promotion of promotions) {
    // promotion_codes cascades from promotions; promotion_redemptions is
    // ON DELETE RESTRICT, so a promotion that was genuinely used cannot be
    // deleted — that history is real and must not be forced.
    //
    // THE BUG THIS FIXES: the failure used to be swallowed by a bare
    // `.catch(() => {})`, and the tally below still counted the row as though
    // it had gone. A fixture promotion created `automatic: true` with no dates
    // and no usage limit therefore stayed ACTIVE in production for ever, taking
    // 15% off every real order, while teardown reported success. Deactivating
    // is the honest outcome: the redemption history survives, and the promotion
    // can never apply again.
    try {
      await rest(`promotions?id=eq.${promotion.id}`, { method: "DELETE" });
      deletedPromotions += 1;
    } catch {
      await rest(`promotions?id=eq.${promotion.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "expired", automatic: false }),
      }).catch(() => {});
      strandedPromotions += 1;
      console.warn(
        `  !! ${promotion.name} has real redemptions and could not be deleted.\n` +
          `     It has been expired and de-automated instead — it will never apply\n` +
          `     to another order, but the row and its history remain.`,
      );
    }
  }
  console.log(
    `  promotions           ${deletedPromotions} deleted` +
      (strandedPromotions ? `, ${strandedPromotions} expired (had real redemptions)` : ""),
  );

  // Both addresses: a fixture created before the domain change lives under
  // `.local`, one created after lives under the site host.
  for (const adminEmail of [
    adminEmailForUsername("zzqa-admin"),
    "zzqa-admin@admin.baebe-boo.local",
  ]) {
    await rest(`admin_users?email=eq.${encodeURIComponent(adminEmail)}`, { method: "DELETE" });
    const adminUser = await findAuthUser(adminEmail);
    if (adminUser) await gotrue(`admin/users/${adminUser.id}`, { method: "DELETE" }).catch(() => {});
  }
  console.log("  admin                cleared");

  console.log("\nDone. Nothing outside the ZZQA prefix was touched.");
}

// ---------------------------------------------------------------------------

const command = process.argv[2];
const commands = { create, list, teardown };

if (!commands[command]) {
  console.error("Usage: node scripts/qa/fixtures.mjs <create|list|teardown>");
  process.exit(1);
}

commands[command]().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
