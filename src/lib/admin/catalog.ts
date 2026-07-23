import "server-only";

import type {
  InventoryAdjustmentInput,
  ProductCreateInput,
  ProductPatchInput,
} from "./catalog-schemas";
import { supabaseAdmin } from "@/lib/supabase-admin";

type AdminActor = {
  userId: string;
  role: string;
};

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  age_range: string | null;
  gender: string | null;
  sku: string | null;
  price: number | string;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
};

type VariantRow = {
  id: string;
  product_id: string;
  sku: string;
  title: string;
  price: number | string;
  option_values: Record<string, unknown> | null;
  is_default: boolean;
  is_active: boolean;
};

type InventoryRow = {
  id: string;
  variant_id: string;
  shop_id: string;
  on_hand: number;
  reserved: number;
  reorder_point: number;
  updated_at: string;
};

type AvailabilityRow = {
  product_id: string;
  shop_id: string;
  stock_quantity: number;
  is_available: boolean;
};

type ShopRow = {
  id: string;
  name: string;
  location: string;
  is_active: boolean;
};

export class AdminCatalogError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AdminCatalogError";
  }
}

function databaseFailure(message: string): never {
  throw new AdminCatalogError(409, message);
}

function makeSku() {
  return `BB-${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
}

async function recordAudit(
  actor: AdminActor,
  action: string,
  tableName: string,
  recordId: string,
  oldValues: unknown,
  newValues: unknown,
) {
  const result = await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: actor.userId,
    actor_role: actor.role,
    action,
    table_name: tableName,
    record_id: recordId,
    old_values: oldValues,
    new_values: newValues,
  });

  // Older production databases use the original audit-log shape. Preserve
  // an audit trail across that migration boundary until the normalized table
  // is deployed everywhere.
  if (result.error) {
    await supabaseAdmin.from("audit_logs").insert({
      admin_email: actor.userId,
      action,
      table_name: tableName,
      record_id: recordId,
      details: { oldValues, newValues, actorRole: actor.role },
    });
  }
}

async function ensureActiveShops(shopIds: string[]) {
  const { data, error } = await supabaseAdmin
    .from("shops")
    .select("id")
    .in("id", shopIds)
    .eq("is_active", true);
  if (error || (data || []).length !== shopIds.length) {
    throw new AdminCatalogError(
      400,
      "One or more selected shops are not active.",
    );
  }
}

async function loadCatalogRows(productId?: string) {
  let productQuery = supabaseAdmin
    .from("products")
    .select(
      "id,name,description,category,age_range,gender,sku,price,image_url,is_active,created_at",
    )
    .order("created_at", { ascending: false });
  if (productId) productQuery = productQuery.eq("id", productId);

  const { data: productData, error: productError } = await productQuery;
  if (productError) databaseFailure("Could not load products.");
  const products = (productData || []) as ProductRow[];
  const productIds = products.map((product) => product.id);
  if (productIds.length === 0) return [];

  const [{ data: variantData, error: variantError }, { data: availabilityData, error: availabilityError }] =
    await Promise.all([
      supabaseAdmin
        .from("product_variants")
        .select("id,product_id,sku,title,price,option_values,is_default,is_active")
        .in("product_id", productIds),
      supabaseAdmin
        .from("product_shop_availability")
        .select("product_id,shop_id,stock_quantity,is_available")
        .in("product_id", productIds),
    ]);
  if (variantError || availabilityError) {
    databaseFailure("Could not load complete product details.");
  }

  const variants = (variantData || []) as VariantRow[];
  const variantIds = variants.map((variant) => variant.id);
  const { data: inventoryData, error: inventoryError } = variantIds.length
    ? await supabaseAdmin
        .from("inventory_levels")
        .select(
          "id,variant_id,shop_id,on_hand,reserved,reorder_point,updated_at",
        )
        .in("variant_id", variantIds)
    : { data: [], error: null };
  if (inventoryError) databaseFailure("Could not load inventory levels.");

  const availability = (availabilityData || []) as AvailabilityRow[];
  const inventory = (inventoryData || []) as InventoryRow[];
  const shopIds = [
    ...new Set([
      ...availability.map((row) => row.shop_id),
      ...inventory.map((row) => row.shop_id),
    ]),
  ];
  const { data: shopData, error: shopError } = shopIds.length
    ? await supabaseAdmin
        .from("shops")
        .select("id,name,location,is_active")
        .in("id", shopIds)
    : { data: [], error: null };
  if (shopError) databaseFailure("Could not load shop details.");
  const shops = (shopData || []) as ShopRow[];

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description || "",
    category: product.category,
    ageRange: product.age_range || "",
    gender: product.gender || "",
    sku:
      product.sku ||
      variants.find(
        (variant) => variant.product_id === product.id && variant.is_default,
      )?.sku ||
      "",
    price: Number(product.price),
    imageUrl: product.image_url || "",
    active: product.is_active,
    createdAt: product.created_at,
    availability: availability
      .filter((row) => row.product_id === product.id)
      .map((row) => ({
        shopId: row.shop_id,
        stockQuantity: Number(row.stock_quantity),
        isAvailable: row.is_available,
      })),
    variants: variants
      .filter((variant) => variant.product_id === product.id)
      .map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        title: variant.title,
        price: Number(variant.price),
        isDefault: variant.is_default,
        active: variant.is_active,
        optionValues: variant.option_values || {},
        inventory: inventory
          .filter((level) => level.variant_id === variant.id)
          .map((level) => {
            const shop = shops.find((row) => row.id === level.shop_id);
            return {
              id: level.id,
              shopId: level.shop_id,
              shopName: shop?.name || "Shop",
              shopLocation: shop?.location || "",
              onHand: level.on_hand,
              reserved: level.reserved,
              available: level.on_hand - level.reserved,
              reorderPoint: level.reorder_point,
              updatedAt: level.updated_at,
            };
          }),
      })),
  }));
}

export async function listProducts() {
  return loadCatalogRows();
}

export async function createProduct(
  input: ProductCreateInput,
  actor: AdminActor,
) {
  const shopIds = input.availability.map((level) => level.shopId);
  await ensureActiveShops(shopIds);
  const sku = input.sku || makeSku();
  let productId: string | null = null;

  try {
    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .insert({
        name: input.name,
        description: input.description,
        category: input.category,
        age_range: input.ageRange,
        gender: input.gender,
        sku,
        price: input.price,
        image_url: input.imageUrl || null,
        is_active: input.isActive,
      })
      .select("id")
      .single();
    if (productError || !product) databaseFailure("Could not create product.");
    productId = product.id;
    const createdProductId = product.id;

    const { data: variant, error: variantError } = await supabaseAdmin
      .from("product_variants")
      .insert({
        product_id: createdProductId,
        sku,
        title: input.name,
        price: input.price,
        is_default: true,
        is_active: input.isActive,
      })
      .select("id")
      .single();
    if (variantError || !variant) {
      databaseFailure("Could not create the default product option.");
    }

    const [{ error: legacyError }, { error: inventoryError }] =
      await Promise.all([
        supabaseAdmin.from("product_shop_availability").insert(
          input.availability.map((level) => ({
            product_id: createdProductId,
            shop_id: level.shopId,
            stock_quantity: level.onHand,
            is_available: input.isActive,
          })),
        ),
        supabaseAdmin.from("inventory_levels").insert(
          input.availability.map((level) => ({
            variant_id: variant.id,
            shop_id: level.shopId,
            on_hand: level.onHand,
            reserved: 0,
            reorder_point: level.reorderPoint,
          })),
        ),
      ]);
    if (legacyError || inventoryError) {
      databaseFailure("Could not create product inventory.");
    }

    if (!createdProductId) {
      databaseFailure("Could not create product.");
    }

    const createdProduct = (await loadCatalogRows(createdProductId))[0];
    await recordAudit(
      actor,
      "create",
      "products",
      createdProductId,
      null,
      { ...input, sku },
    );
    return createdProduct;
  } catch (error) {
    if (productId) {
      await supabaseAdmin
        .from("product_shop_availability")
        .delete()
        .eq("product_id", productId);
      await supabaseAdmin.from("products").delete().eq("id", productId);
    }
    throw error;
  }
}

export async function patchProduct(
  productId: string,
  patch: ProductPatchInput,
  actor: AdminActor,
) {
  const { data: previousData, error: previousError } = await supabaseAdmin
    .from("products")
    .select(
      "id,name,description,category,age_range,gender,sku,price,image_url,is_active,created_at",
    )
    .eq("id", productId)
    .maybeSingle();
  if (previousError) databaseFailure("Could not load product.");
  if (!previousData) throw new AdminCatalogError(404, "Product not found.");
  const previous = previousData as ProductRow;
  const { data: previousVariantData, error: previousVariantError } =
    await supabaseAdmin
      .from("product_variants")
      .select("id,product_id,sku,title,price,option_values,is_default,is_active")
      .eq("product_id", productId)
      .eq("is_default", true)
      .maybeSingle();
  if (previousVariantError) {
    databaseFailure("Could not load the default product option.");
  }
  const previousVariant = previousVariantData as VariantRow | null;
  if (!previousVariant) {
    databaseFailure("Product has no default option to update.");
  }
  const rollbackProduct = async () => {
    await supabaseAdmin
      .from("products")
      .update({
        name: previous.name,
        description: previous.description,
        category: previous.category,
        age_range: previous.age_range,
        gender: previous.gender,
        sku: previous.sku,
        price: previous.price,
        image_url: previous.image_url,
        is_active: previous.is_active,
      })
      .eq("id", productId);
    if (previousVariant) {
      await supabaseAdmin
        .from("product_variants")
        .update({
          sku: previousVariant.sku,
          title: previousVariant.title,
          price: previousVariant.price,
          is_active: previousVariant.is_active,
        })
        .eq("id", previousVariant.id);
    }
  };

  const productChanges = {
    ...(patch.name !== undefined && { name: patch.name }),
    ...(patch.description !== undefined && {
      description: patch.description,
    }),
    ...(patch.category !== undefined && { category: patch.category }),
    ...(patch.ageRange !== undefined && { age_range: patch.ageRange }),
    ...(patch.gender !== undefined && { gender: patch.gender }),
    ...(patch.sku !== undefined && { sku: patch.sku }),
    ...(patch.price !== undefined && { price: patch.price }),
    ...(patch.imageUrl !== undefined && { image_url: patch.imageUrl || null }),
    ...(patch.isActive !== undefined && { is_active: patch.isActive }),
  };
  const { error: productError } = await supabaseAdmin
    .from("products")
    .update(productChanges)
    .eq("id", productId);
  if (productError) databaseFailure("Could not update product.");

  const variantChanges = {
    ...(patch.name !== undefined && { title: patch.name }),
    ...(patch.sku !== undefined && { sku: patch.sku }),
    ...(patch.price !== undefined && { price: patch.price }),
    ...(patch.isActive !== undefined && { is_active: patch.isActive }),
  };
  if (Object.keys(variantChanges).length > 0) {
    const { error: variantError } = await supabaseAdmin
      .from("product_variants")
      .update(variantChanges)
      .eq("product_id", productId)
      .eq("is_default", true);
    if (variantError) {
      await rollbackProduct();
      databaseFailure("Could not update the default product option.");
    }
  }

  if (patch.isActive !== undefined) {
    const { error: availabilityError } = await supabaseAdmin
      .from("product_shop_availability")
      .update({ is_available: patch.isActive })
      .eq("product_id", productId);
    if (availabilityError) {
      await rollbackProduct();
      databaseFailure("Could not update product availability.");
    }
  }

  await recordAudit(
    actor,
    "update",
    "products",
    productId,
    previous,
    patch,
  );
  return (await loadCatalogRows(productId))[0];
}

export async function archiveProduct(productId: string, actor: AdminActor) {
  await patchProduct(productId, { isActive: false }, actor);
}

export async function listInventory(input: {
  shopId?: string;
  productId?: string;
  lowStock?: boolean;
  limit: number;
}) {
  let variantQuery = supabaseAdmin
    .from("product_variants")
    .select("id,product_id,sku,title,price,option_values,is_default,is_active");
  if (input.productId) {
    variantQuery = variantQuery.eq("product_id", input.productId);
  }
  const { data: variantData, error: variantError } = await variantQuery;
  if (variantError) databaseFailure("Could not load product options.");
  const variants = (variantData || []) as VariantRow[];
  const variantIds = variants.map((variant) => variant.id);
  if (variantIds.length === 0) return [];

  let inventoryQuery = supabaseAdmin
    .from("inventory_levels")
    .select("id,variant_id,shop_id,on_hand,reserved,reorder_point,updated_at")
    .in("variant_id", variantIds)
    .order("updated_at", { ascending: false })
    .limit(input.limit);
  if (input.shopId) inventoryQuery = inventoryQuery.eq("shop_id", input.shopId);
  const { data: inventoryData, error: inventoryError } = await inventoryQuery;
  if (inventoryError) databaseFailure("Could not load inventory.");
  let inventory = (inventoryData || []) as InventoryRow[];
  if (input.lowStock) {
    inventory = inventory.filter(
      (level) => level.on_hand - level.reserved <= level.reorder_point,
    );
  }

  const productIds = [...new Set(variants.map((variant) => variant.product_id))];
  const shopIds = [...new Set(inventory.map((level) => level.shop_id))];
  const [
    { data: productData, error: productError },
    { data: shopData, error: shopError },
  ] = await Promise.all([
    supabaseAdmin.from("products").select("id,name,is_active").in("id", productIds),
    shopIds.length
      ? supabaseAdmin
          .from("shops")
          .select("id,name,location,is_active")
          .in("id", shopIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (productError || shopError) databaseFailure("Could not load inventory details.");
  const products = (productData || []) as Array<{
    id: string;
    name: string;
    is_active: boolean;
  }>;
  const shops = (shopData || []) as ShopRow[];

  return inventory.map((level) => {
    const variant = variants.find((row) => row.id === level.variant_id)!;
    const product = products.find((row) => row.id === variant.product_id);
    const shop = shops.find((row) => row.id === level.shop_id);
    return {
      id: level.id,
      variantId: level.variant_id,
      productId: variant.product_id,
      productName: product?.name || "Product",
      sku: variant.sku,
      variantTitle: variant.title,
      shopId: level.shop_id,
      shopName: shop?.name || "Shop",
      shopLocation: shop?.location || "",
      onHand: level.on_hand,
      reserved: level.reserved,
      available: level.on_hand - level.reserved,
      reorderPoint: level.reorder_point,
      lowStock: level.on_hand - level.reserved <= level.reorder_point,
      updatedAt: level.updated_at,
    };
  });
}

export async function adjustInventory(
  variantId: string,
  shopId: string,
  input: InventoryAdjustmentInput,
  actor: AdminActor,
) {
  const [{ data: variantData, error: variantError }, { data: shopData, error: shopError }] =
    await Promise.all([
      supabaseAdmin
        .from("product_variants")
        .select("id,product_id,sku,title,is_active")
        .eq("id", variantId)
        .maybeSingle(),
      supabaseAdmin
        .from("shops")
        .select("id,name,location,is_active")
        .eq("id", shopId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);
  if (variantError || shopError) databaseFailure("Could not validate inventory target.");
  if (!variantData || !shopData) {
    throw new AdminCatalogError(404, "Product option or shop not found.");
  }

  const { data: previousData, error: previousError } = await supabaseAdmin
    .from("inventory_levels")
    .select("id,variant_id,shop_id,on_hand,reserved,reorder_point,updated_at")
    .eq("variant_id", variantId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (previousError) databaseFailure("Could not load inventory level.");
  const previous = previousData as InventoryRow | null;
  if (previous && input.onHand < previous.reserved) {
    throw new AdminCatalogError(
      409,
      `On-hand stock cannot be lower than ${previous.reserved} reserved units.`,
    );
  }

  const { data: level, error: levelError } = await supabaseAdmin
    .from("inventory_levels")
    .upsert(
      {
        variant_id: variantId,
        shop_id: shopId,
        on_hand: input.onHand,
        reserved: previous?.reserved || 0,
        reorder_point: input.reorderPoint ?? previous?.reorder_point ?? 0,
      },
      { onConflict: "variant_id,shop_id" },
    )
    .select("id,variant_id,shop_id,on_hand,reserved,reorder_point,updated_at")
    .single();
  if (levelError || !level) databaseFailure("Could not update inventory.");
  const rollbackInventory = async () => {
    if (previous) {
      await supabaseAdmin
        .from("inventory_levels")
        .upsert(previous, { onConflict: "variant_id,shop_id" });
    } else {
      await supabaseAdmin
        .from("inventory_levels")
        .delete()
        .eq("variant_id", variantId)
        .eq("shop_id", shopId);
    }
  };

  const { data: siblingVariants, error: siblingError } = await supabaseAdmin
    .from("product_variants")
    .select("id")
    .eq("product_id", variantData.product_id);
  if (siblingError) {
    await rollbackInventory();
    databaseFailure("Could not synchronize legacy inventory.");
  }
  const siblingIds = (siblingVariants || []).map((variant) => variant.id);
  const { data: siblingLevels, error: siblingLevelError } = await supabaseAdmin
    .from("inventory_levels")
    .select("on_hand")
    .in("variant_id", siblingIds)
    .eq("shop_id", shopId);
  if (siblingLevelError) {
    await rollbackInventory();
    databaseFailure("Could not synchronize legacy inventory.");
  }
  const totalOnHand = (siblingLevels || []).reduce(
    (sum, row) => sum + Number(row.on_hand),
    0,
  );
  const { data: product, error: productError } = await supabaseAdmin
    .from("products")
    .select("is_active")
    .eq("id", variantData.product_id)
    .single();
  if (productError || !product) {
    await rollbackInventory();
    databaseFailure("Could not synchronize legacy inventory.");
  }
  const { error: legacyError } = await supabaseAdmin
    .from("product_shop_availability")
    .upsert(
      {
        product_id: variantData.product_id,
        shop_id: shopId,
        stock_quantity: totalOnHand,
        is_available: Boolean(product?.is_active) && totalOnHand > 0,
      },
      { onConflict: "product_id,shop_id" },
    );
  if (legacyError) {
    await rollbackInventory();
    databaseFailure("Could not synchronize legacy inventory.");
  }

  await recordAudit(
    actor,
    "adjust_stock",
    "inventory_levels",
    level.id,
    previous,
    level,
  );
  return {
    id: level.id,
    variantId,
    productId: variantData.product_id,
    shopId,
    onHand: level.on_hand,
    reserved: level.reserved,
    available: level.on_hand - level.reserved,
    reorderPoint: level.reorder_point,
    updatedAt: level.updated_at,
  };
}
