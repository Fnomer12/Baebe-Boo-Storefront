import { NextResponse } from "next/server";
import { promotionCreateSchema } from "@/domain/commerce/promotion-schemas";
import { promotionProductRows } from "@/domain/commerce/promotion-targeting";
import { fieldErrors } from "@/lib/admin/schema-helpers";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const promotionColumns =
  "id, name, description, promotion_type, value, status, starts_at, ends_at, minimum_order_amount, usage_limit, per_customer_limit, stackable, automatic, created_at, updated_at";

export async function GET() {
  const authorization = await authorizeAdminApi("customers:read");
  if (!authorization.authorized) return authorization.response;

  const { data: promotions, error } = await supabaseAdmin
    .from("promotions")
    .select(promotionColumns)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { message: "Promotions could not be loaded." },
      { status: 500 },
    );
  }

  const ids = (promotions || []).map((promotion) => promotion.id);
  // Codes and targeting are decoration on this screen. If either query fails —
  // an unapplied migration, a permissions gap — the list still renders rather
  // than the whole workspace erroring out.
  const [codeResult, targetingResult] = ids.length
    ? await Promise.all([
        supabaseAdmin
          .from("promotion_codes")
          .select("promotion_id, code, is_active, usage_count")
          .in("promotion_id", ids),
        supabaseAdmin
          .from("promotion_products")
          .select("promotion_id, product_id, is_excluded")
          .in("promotion_id", ids),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];

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

  return NextResponse.json({
    promotions: (promotions || []).map((promotion) => {
      const targeting = targetingByPromotion.get(promotion.id);
      return {
        id: promotion.id,
        name: promotion.name,
        description: promotion.description ?? null,
        promotionType: promotion.promotion_type,
        value: promotion.value,
        status: promotion.status,
        startsAt: promotion.starts_at,
        endsAt: promotion.ends_at,
        minimumOrderAmount: promotion.minimum_order_amount,
        usageLimit: promotion.usage_limit,
        perCustomerLimit: promotion.per_customer_limit,
        stackable: promotion.stackable,
        automatic: promotion.automatic,
        code: codeByPromotion.get(promotion.id)?.code ?? null,
        codeUsageCount: codeByPromotion.get(promotion.id)?.usageCount ?? 0,
        productIds: targeting?.included ?? [],
        excludedProductIds: targeting?.excluded ?? [],
        createdAt: promotion.created_at,
        updatedAt: promotion.updated_at,
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
  const { data: promotion, error: insertError } = await supabaseAdmin
    .from("promotions")
    .insert({
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
    })
    .select("id")
    .single();

  if (insertError || !promotion) {
    return NextResponse.json(
      { message: "Promotion could not be created." },
      { status: 500 },
    );
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

  return NextResponse.json({ id: promotion.id }, { status: 201 });
}
