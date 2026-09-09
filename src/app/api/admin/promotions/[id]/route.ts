import { NextResponse } from "next/server";
import {
  mergePromotionPatch,
  promotionPatchSchema,
  promotionUpdateIssues,
  type StoredPromotion,
} from "@/domain/commerce/promotion-schemas";
import { promotionCategoryRows, promotionProductRows } from "@/domain/commerce/promotion-targeting";
import { fieldErrors } from "@/lib/admin/schema-helpers";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Editing, pausing and deleting a promotion.
 *
 * Promotions used to be create-only: a typo in the name, a campaign that had
 * to stop early, or a code that leaked all had the same fix — nothing. The
 * only lever was the status column, which no screen wrote either.
 */

type PromotionRow = {
  id: string;
  promotion_type: string;
  value: number | string;
  status: "draft" | "active" | "paused" | "expired";
  automatic: boolean;
  available_online?: boolean | null;
  available_at_counter?: boolean | null;
  starts_at: string | null;
  ends_at: string | null;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = promotionPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Some details need fixing before this promotion can be saved.",
        errors: fieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }
  const patch = parsed.data;

  let row: PromotionRow;
  {
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("promotions")
      .select("id, promotion_type, value, status, automatic, available_online, available_at_counter, starts_at, ends_at")
      .eq("id", id)
      .maybeSingle();
    if (!lookupError && existing) {
      row = existing as PromotionRow;
    } else if (!lookupError && !existing) {
      return NextResponse.json({ message: "Promotion not found." }, { status: 404 });
    } else {
      // Channel columns missing (migration unapplied): retry the legacy shape.
      const legacy = await supabaseAdmin
        .from("promotions")
        .select("id, promotion_type, value, status, automatic, starts_at, ends_at")
        .eq("id", id)
        .maybeSingle();
      if (legacy.error) {
        return NextResponse.json({ message: "Promotion could not be loaded." }, { status: 500 });
      }
      if (!legacy.data) {
        return NextResponse.json({ message: "Promotion not found." }, { status: 404 });
      }
      row = legacy.data as PromotionRow;
    }
  }

  // THE BUG: this read the first row of an unordered, unfiltered select while
  // the list endpoint skips `is_active = false` rows. The two handlers could
  // therefore disagree about which code a promotion currently has — the form
  // would show one code and the patch would compare against another, so saving
  // an unrelated field looked like a code change (or a real change looked like
  // no change at all). Both now mean "the oldest live code".
  const { data: existingCodes } = await supabaseAdmin
    .from("promotion_codes")
    .select("id, code, is_active")
    .eq("promotion_id", id)
    .order("created_at", { ascending: true });
  const liveCode = (existingCodes || []).find((codeRow) => codeRow.is_active !== false);
  const currentCode = liveCode?.code ? String(liveCode.code) : null;

  // Every rule below is about the row as it will look after the patch, not
  // about the handful of fields the form happened to send.
  const current: StoredPromotion = {
    promotionType: row.promotion_type,
    value: Number(row.value),
    status: row.status,
    automatic: row.automatic,
    availableOnline: row.available_online !== false,
    availableAtCounter: row.available_at_counter === true,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    code: currentCode,
  };
  const merged = mergePromotionPatch(current, patch);
  const issues = promotionUpdateIssues(current, patch);
  if (Object.keys(issues).length > 0) {
    return NextResponse.json(
      { message: "Some details need fixing before this promotion can be saved.", errors: issues },
      { status: 400 },
    );
  }

  const nextCode = patch.code === undefined ? undefined : (patch.code?.toUpperCase() ?? null);
  const codeChanged = nextCode !== undefined && nextCode !== currentCode;
  if (codeChanged && existingCodes && existingCodes.length > 0) {
    // `promotion_redemptions.promotion_code_id` is ON DELETE RESTRICT, so
    // dropping a used code fails in the database. Checked here, before
    // anything is written, so the admin gets an explanation rather than a
    // half-saved promotion.
    const { count, error: usageError } = await supabaseAdmin
      .from("promotion_redemptions")
      .select("id", { count: "exact", head: true })
      .in(
        "promotion_code_id",
        existingCodes.map((row) => row.id),
      );
    if (usageError) {
      return NextResponse.json({ message: "Promotion could not be saved." }, { status: 500 });
    }
    if ((count || 0) > 0) {
      return NextResponse.json(
        {
          message: "Some details need fixing before this promotion can be saved.",
          errors: {
            code: `Customers have already used ${currentCode} on an order, so this code cannot be changed or removed. Pause this promotion and create a new one instead.`,
          },
        },
        { status: 409 },
      );
    }
  }

  // THE BUG: the replacement code used to be tried only after the promotion row
  // had been saved and the old code deleted, so a collision — `code` is unique
  // across every promotion — destroyed a working code and left a live
  // promotion with none, unreachable by any customer. The collision is now
  // proven absent before a single write happens.
  if (codeChanged && nextCode) {
    const { data: holders, error: holderError } = await supabaseAdmin
      .from("promotion_codes")
      .select("id, promotion_id, code")
      .ilike("code", nextCode);
    if (holderError) {
      return NextResponse.json({ message: "Promotion could not be saved." }, { status: 500 });
    }
    // Rows belonging to this promotion are about to be replaced anyway; only
    // another promotion's claim is a real collision. The equality is redone
    // here because `_` is a single-character wildcard to ILIKE and codes are
    // allowed to contain one, so the query over-matches on purpose. Case is
    // ignored even though the unique index is case-sensitive: checkout looks a
    // typed code up with ILIKE and `.maybeSingle()`, so two codes differing
    // only in case would leave both unusable.
    const conflicting = (holders || []).filter(
      (holder) =>
        String(holder.code).toUpperCase() === nextCode && String(holder.promotion_id) !== id,
    );
    if (conflicting.length > 0) {
      return NextResponse.json(
        {
          message: "That promotion code is already in use.",
          errors: { code: "Another promotion already uses this code. Pick a different one." },
        },
        { status: 409 },
      );
    }
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.promotionType !== undefined) update.promotion_type = patch.promotionType;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.stackable !== undefined) update.stackable = patch.stackable;
  if (patch.automatic !== undefined) update.automatic = patch.automatic;
  if (patch.availableOnline !== undefined) update.available_online = patch.availableOnline;
  if (patch.availableAtCounter !== undefined) update.available_at_counter = patch.availableAtCounter;
  if (patch.startsAt !== undefined) update.starts_at = patch.startsAt;
  if (patch.endsAt !== undefined) update.ends_at = patch.endsAt;
  if (patch.minimumOrderAmount !== undefined) update.minimum_order_amount = patch.minimumOrderAmount;
  if (patch.usageLimit !== undefined) update.usage_limit = patch.usageLimit;
  if (patch.perCustomerLimit !== undefined) update.per_customer_limit = patch.perCustomerLimit;
  // `mergePromotionPatch` has already zeroed the value for free delivery.
  if (patch.value !== undefined || patch.promotionType !== undefined) {
    update.value = merged.value;
  }

  const { error: updateError } = await supabaseAdmin
    .from("promotions")
    .update(update)
    .eq("id", id);
  if (updateError) {
    // Channel columns missing (migration unapplied): retry without them.
    if (
      (patch.availableOnline !== undefined || patch.availableAtCounter !== undefined) &&
      /available_online|available_at_counter/i.test(updateError.message || "")
    ) {
      delete update.available_online;
      delete update.available_at_counter;
      const { error: retryError } = await supabaseAdmin.from("promotions").update(update).eq("id", id);
      if (retryError) {
        return NextResponse.json({ message: "Promotion could not be saved." }, { status: 500 });
      }
    } else {
      return NextResponse.json({ message: "Promotion could not be saved." }, { status: 500 });
    }
  }

  if (codeChanged) {
    // One code per promotion is what the workspace exposes, so replacing means
    // clearing what is there first. Safe in this order only because the
    // pre-flight above proved no other promotion holds `nextCode`.
    const { error: clearError } = await supabaseAdmin
      .from("promotion_codes")
      .delete()
      .eq("promotion_id", id);
    if (clearError) {
      return NextResponse.json(
        { message: "The promotion saved, but its code could not be changed." },
        { status: 500 },
      );
    }
    if (nextCode) {
      const { error: codeError } = await supabaseAdmin
        .from("promotion_codes")
        .insert({ promotion_id: id, code: nextCode });
      if (codeError) {
        // Another admin claimed the code in the moment between the pre-flight
        // and here. Put the promotion's own code back rather than leaving it
        // live and unreachable; there are no redemptions pointing at it (that
        // was checked above), so nothing depends on the row's identity.
        if (currentCode) {
          await supabaseAdmin
            .from("promotion_codes")
            .insert({ promotion_id: id, code: currentCode });
        }
        return NextResponse.json(
          {
            message: "That promotion code is already in use.",
            errors: { code: "Another promotion already uses this code. Pick a different one." },
          },
          { status: 409 },
        );
      }
    }
  }

  if (patch.productIds !== undefined || patch.excludedProductIds !== undefined) {
    const { error: clearError } = await supabaseAdmin
      .from("promotion_products")
      .delete()
      .eq("promotion_id", id);
    if (clearError) {
      return NextResponse.json(
        { message: "The promotion saved, but the products it applies to did not." },
        { status: 500 },
      );
    }
    const rows = promotionProductRows(id, patch);
    if (rows.length > 0) {
      const { error: targetingError } = await supabaseAdmin
        .from("promotion_products")
        .insert(rows);
      if (targetingError) {
        return NextResponse.json(
          {
            message: "The promotion saved, but the products it applies to did not.",
            errors: { productIds: "One of these products could not be found. Reload and try again." },
          },
          { status: 400 },
        );
      }
    }
  }

  if (patch.categories !== undefined || patch.excludedCategories !== undefined) {
    const { error: clearCategoryError } = await supabaseAdmin
      .from("promotion_categories")
      .delete()
      .eq("promotion_id", id);
    if (clearCategoryError) {
      // Missing table (migration unapplied): categories simply do not persist
      // yet, but the rest of the promotion already saved.
      if (!/relation .* does not exist|promotion_categories/i.test(clearCategoryError.message || "")) {
        return NextResponse.json(
          { message: "The promotion saved, but the categories it applies to did not." },
          { status: 500 },
        );
      }
    } else {
      const categoryRows = promotionCategoryRows(id, patch);
      if (categoryRows.length > 0) {
        const { error: categoryError } = await supabaseAdmin
          .from("promotion_categories")
          .insert(categoryRows);
        if (categoryError) {
          return NextResponse.json(
            {
              message: "The promotion saved, but the categories it applies to did not.",
              errors: { categories: "Those categories could not be saved. Reload and try again." },
            },
            { status: 400 },
          );
        }
      }
    }
  }

  return NextResponse.json({ id });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;

  // `promotion_redemptions.promotion_id` is ON DELETE RESTRICT, so a used
  // promotion would fail with a raw database error. Say what to do instead.
  const { count, error: redemptionError } = await supabaseAdmin
    .from("promotion_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("promotion_id", id);
  if (redemptionError) {
    return NextResponse.json({ message: "Promotion could not be deleted." }, { status: 500 });
  }
  if ((count || 0) > 0) {
    return NextResponse.json(
      {
        message:
          "Customers have already used this promotion, so it has to stay on their order history. Pause it instead to stop it being used again.",
      },
      { status: 409 },
    );
  }

  const { error } = await supabaseAdmin.from("promotions").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ message: "Promotion could not be deleted." }, { status: 500 });
  }

  return NextResponse.json({ id, deleted: true });
}
