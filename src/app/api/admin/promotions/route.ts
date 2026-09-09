import { NextResponse } from "next/server";
import { promotionCreateSchema } from "@/domain/commerce/promotion-schemas";
import { promotionCategoryRows, promotionProductRows } from "@/domain/commerce/promotion-targeting";
import { fieldErrors } from "@/lib/admin/schema-helpers";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const promotionColumns =
  "id, name, description, promotion_type, value, status, starts_at, ends_at, minimum_order_amount, usage_limit, per_customer_limit, stackable, automatic, available_online, available_at_counter, created_at, updated_at";

const legacyPromotionColumns =
  "id, name, description, promotion_type, value, status, starts_at, ends_at, minimum_order_amount, usage_limit, per_customer_limit, stackable, automatic, created_at, updated_at";

export async function GET() {
  const authorization = await authorizeAdminApi("customers:read");
  if (!authorization.authorized) return authorization.response;

  let promotions: Record<string, unknown>[] = [];
  {
    const attempt = await supabaseAdmin
      .from("promotions")
      .select(promotionColumns)
      .order("created_at", { ascending: false });
    if (!attempt.error) {
      promotions = (attempt.data || []) as unknown as Record<string, unknown>[];
    } else {
      // Channel columns missing (migration unapplied): read the legacy shape.
      const legacy = await supabaseAdmin
        .from("promotions")
        .select(legacyPromotionColumns)
        .order("created_at", { ascending: false });
      if (legacy.error) {
        return NextResponse.json(
          { message: "Promotions could not be loaded." },
          { status: 500 },
        );
      }
      promotions = ((legacy.data || []) as unknown as Record<string, unknown>[]).map((row) => ({
        ...row,
        available_online: true,
        available_at_counter: false,
      }));
    }
  }

  const ids = (promotions || []).map((promotion) => String((promotion as { id: unknown }).id));
  // Codes and targeting are decoration on this screen. If either query fails —
  // an unapplied migration, a permissions gap — the list still renders rather
  // than the whole workspace erroring out.
  const [codeResult, targetingResult, categoryResult] = ids.length
    ? await Promise.all([
        supabaseAdmin
          .from("promotion_codes")
          .select("promotion_id, code, is_active, usage_count")
          .in("promotion_id", ids),
        supabaseAdmin
          .from("promotion_products")
          .select("promotion_id, product_id, is_excluded")
          .in("promotion_id", ids),
        supabaseAdmin
          .from("promotion_categories")
          .select("promotion_id, category, is_excluded")
          .in("promotion_id", ids),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];

  const codeByPromotion = new Map<string, { code: string; usageCount: number }>();
  for (const row of codeResult.error ? [] : codeResult.data || []) {
    if (row.is_active === false) continue;
    if (!codeByPromotion.has(row.promotion_id)) {
      codeByPromotion.set(row.promotion_id, {
        code: String(row.code),
        usageCount: Number(row.usage_count || 0),
      });
    }
  }

  const targetingByPromotion = new Map<string, { included: string[]; excluded: string[] }>();
  for (const row of targetingResult.error ? [] : targetingResult.data || []) {
    const entry = targetingByPromotion.get(row.promotion_id) || { included: [], excluded: [] };
    (row.is_excluded ? entry.excluded : entry.included).push(String(row.product_id));
    targetingByPromotion.set(row.promotion_id, entry);
  }

  const categoriesByPromotion = new Map<string, { included: string[]; excluded: string[] }>();
  for (const row of categoryResult.error ? [] : categoryResult.data || []) {
    const entry = categoriesByPromotion.get(row.promotion_id) || { included: [], excluded: [] };
    (row.is_excluded ? entry.excluded : entry.included).push(String(row.category));
    categoriesByPromotion.set(row.promotion_id, entry);
  }

  return NextResponse.json({
    promotions: (promotions || []).map((promotion) => {
      const row = promotion as unknown as {
        id: string;
        name: string;
        description: string | null;
        promotion_type: string;
        value: number;
        status: string;
        starts_at: string | null;
        ends_at: string | null;
        minimum_order_amount: number | null;
        usage_limit: number | null;
        per_customer_limit: number | null;
        stackable: boolean;
        automatic: boolean;
        available_online?: boolean | null;
        available_at_counter?: boolean | null;
        created_at: string;
        updated_at: string;
      };
      const targeting = targetingByPromotion.get(row.id);
      const categories = categoriesByPromotion.get(row.id);
      return {
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        promotionType: row.promotion_type,
        value: row.value,
        status: row.status,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        minimumOrderAmount: row.minimum_order_amount,
        usageLimit: row.usage_limit,
        perCustomerLimit: row.per_customer_limit,
        stackable: row.stackable,
        automatic: row.automatic,
        availableOnline: row.available_online !== false,
        availableAtCounter: row.available_at_counter === true,
        code: codeByPromotion.get(row.id)?.code ?? null,
        codeUsageCount: codeByPromotion.get(row.id)?.usageCount ?? 0,
        productIds: targeting?.included ?? [],
        excludedProductIds: targeting?.excluded ?? [],
        categories: categories?.included ?? [],
        excludedCategories: categories?.excluded ?? [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }),
  });
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = promotionCreateSchema.safeParse(body);
  if (!parsed.success) {
    // One generic string for a twelve-field form told the admin nothing about
    // which field was wrong — and the field was usually one they never
    // touched. Every message is now pinned to its input.
    return NextResponse.json(
      {
        message: "Some details need fixing before this promotion can be saved.",
        errors: fieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const insertPayload: Record<string, unknown> = {
    name: input.name,
    description: input.description || null,
    promotion_type: input.promotionType,
    value: input.value,
    status: input.status,
    starts_at: input.startsAt || null,
    ends_at: input.endsAt || null,
    minimum_order_amount: input.minimumOrderAmount ?? null,
    usage_limit: input.usageLimit ?? null,
    per_customer_limit: input.perCustomerLimit ?? null,
    stackable: input.stackable,
    automatic: input.automatic,
  };
  // Tolerate the channel migration being unapplied: retry without the flags.
  let promotion: { id: string } | null = null;
  {
    const withChannels = await supabaseAdmin
      .from("promotions")
      .insert({ ...insertPayload, available_online: input.availableOnline ?? true, available_at_counter: input.availableAtCounter ?? false })
      .select("id")
      .single();
    if (!withChannels.error && withChannels.data) {
      promotion = withChannels.data as { id: string };
    } else {
      const legacy = await supabaseAdmin.from("promotions").insert(insertPayload).select("id").single();
      if (legacy.error || !legacy.data) {
        return NextResponse.json(
          { message: "Promotion could not be created." },
          { status: 500 },
        );
      }
      promotion = legacy.data as { id: string };
    }
  }

  if (input.code) {
    const { error: codeError } = await supabaseAdmin.from("promotion_codes").insert({
      promotion_id: promotion.id,
      code: input.code.toUpperCase(),
    });
    if (codeError) {
      await supabaseAdmin.from("promotions").delete().eq("id", promotion.id);
      return NextResponse.json(
        {
          message: "That promotion code is already in use.",
          errors: { code: "Another promotion already uses this code. Pick a different one." },
        },
        { status: 409 },
      );
    }
  }

  const targetingRows = promotionProductRows(promotion.id, input);
  if (targetingRows.length > 0) {
    const { error: targetingError } = await supabaseAdmin
      .from("promotion_products")
      .insert(targetingRows);
    if (targetingError) {
      // A promotion whose targeting silently failed to save would apply to the
      // whole catalogue — the opposite of what was asked for. Undo it all.
      await supabaseAdmin.from("promotions").delete().eq("id", promotion.id);
      return NextResponse.json(
        {
          message: "The selected products could not be saved, so nothing was created.",
          errors: { productIds: "One of these products could not be found. Reload and try again." },
        },
        { status: 400 },
      );
    }
  }

  const categoryRows = promotionCategoryRows(promotion.id, input);
  if (categoryRows.length > 0) {
    const { error: categoryError } = await supabaseAdmin
      .from("promotion_categories")
      .insert(categoryRows);
    if (categoryError) {
      // Missing table (migration unapplied) must not fail the whole create —
      // but a real failure must not leave a miscoped promotion either. Only
      // roll back when the table exists and rejected the rows.
      const isMissingTable = /relation .* does not exist|promotion_categories/i.test(
        categoryError.message || "",
      );
      if (!isMissingTable) {
        await supabaseAdmin.from("promotions").delete().eq("id", promotion.id);
        return NextResponse.json(
          {
            message: "The selected categories could not be saved, so nothing was created.",
            errors: { categories: "Those categories could not be saved. Reload and try again." },
          },
          { status: 400 },
        );
      }
    }
  }

  return NextResponse.json({ id: promotion.id }, { status: 201 });
}
