import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { recordAudit, type AdminActor } from "@/lib/admin/audit";
import type {
  DeliveryZoneCreateInput,
  DeliveryZonePatchInput,
} from "@/lib/admin/delivery-schemas";

export class AdminDeliveryError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
    this.name = "AdminDeliveryError";
  }
}

function databaseFailure(message: string): never {
  throw new AdminDeliveryError(message, 500);
}

function conflict(message: string): never {
  throw new AdminDeliveryError(message, 409);
}

function notFound(message: string): never {
  throw new AdminDeliveryError(message, 404);
}

type DeliveryZoneRow = {
  id: string;
  name: string | null;
  regions: unknown;
  base_fee: number | string | null;
  free_delivery_threshold: number | string | null;
  estimated_days_min: number | null;
  estimated_days_max: number | null;
  is_active: boolean | null;
  created_at: string | null;
};

export type AdminDeliveryZone = {
  id: string;
  name: string;
  regions: string[];
  baseFee: number;
  freeDeliveryThreshold: number | null;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  isActive: boolean;
  createdAt: string;
};

const COLUMNS =
  "id, name, regions, base_fee, free_delivery_threshold, estimated_days_min, estimated_days_max, is_active, created_at";

function toZone(row: DeliveryZoneRow): AdminDeliveryZone {
  return {
    id: row.id,
    name: row.name || "Unnamed zone",
    regions: Array.isArray(row.regions) ? row.regions.map(String) : [],
    baseFee: Number(row.base_fee || 0),
    freeDeliveryThreshold:
      row.free_delivery_threshold === null || row.free_delivery_threshold === undefined
        ? null
        : Number(row.free_delivery_threshold),
    estimatedDaysMin: row.estimated_days_min ?? null,
    estimatedDaysMax: row.estimated_days_max ?? null,
    isActive: row.is_active !== false,
    createdAt: row.created_at || "",
  };
}

/** Every zone, including inactive ones — the storefront only sees active. */
export async function listDeliveryZones(): Promise<AdminDeliveryZone[]> {
  const { data, error } = await supabaseAdmin
    .from("delivery_zones")
    .select(COLUMNS)
    .order("name", { ascending: true });

  if (error) databaseFailure("Delivery zones could not be loaded.");
  return ((data || []) as unknown as DeliveryZoneRow[]).map(toZone);
}

function toRow(input: DeliveryZoneCreateInput | DeliveryZonePatchInput) {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = input.name;
  if (input.regions !== undefined) row.regions = input.regions;
  if (input.baseFee !== undefined) row.base_fee = input.baseFee;
  if (input.isActive !== undefined) row.is_active = input.isActive;
  // `undefined` means "not supplied, leave it"; an explicit `null` means
  // "clear it". Testing for undefined rather than key presence matters because
  // an optional field can survive parsing as an explicitly-undefined key.
  if (input.freeDeliveryThreshold !== undefined) {
    row.free_delivery_threshold = input.freeDeliveryThreshold;
  }
  if (input.estimatedDaysMin !== undefined) {
    row.estimated_days_min = input.estimatedDaysMin;
  }
  if (input.estimatedDaysMax !== undefined) {
    row.estimated_days_max = input.estimatedDaysMax;
  }
  return row;
}

export async function createDeliveryZone(
  input: DeliveryZoneCreateInput,
  actor: AdminActor,
) {
  const { data, error } = await supabaseAdmin
    .from("delivery_zones")
    .insert(toRow(input))
    .select(COLUMNS)
    .single();

  if (error || !data) conflict("The delivery zone could not be created.");

  const zone = toZone(data as unknown as DeliveryZoneRow);
  await recordAudit(actor, "delivery_zone.create", "delivery_zones", zone.id, null, {
    name: zone.name,
    baseFee: zone.baseFee,
  });
  return zone;
}

export async function patchDeliveryZone(
  zoneId: string,
  input: DeliveryZonePatchInput,
  actor: AdminActor,
) {
  const { data: before } = await supabaseAdmin
    .from("delivery_zones")
    .select(COLUMNS)
    .eq("id", zoneId)
    .maybeSingle();
  if (!before) notFound("Delivery zone not found.");

  const { data, error } = await supabaseAdmin
    .from("delivery_zones")
    .update({ ...toRow(input), updated_at: new Date().toISOString() })
    .eq("id", zoneId)
    .select(COLUMNS)
    .maybeSingle();

  if (error) conflict("The delivery zone could not be updated.");
  if (!data) notFound("Delivery zone not found.");

  const previous = toZone(before as unknown as DeliveryZoneRow);
  const zone = toZone(data as unknown as DeliveryZoneRow);
  await recordAudit(
    actor,
    "delivery_zone.update",
    "delivery_zones",
    zone.id,
    { name: previous.name, baseFee: previous.baseFee, isActive: previous.isActive },
    { name: zone.name, baseFee: zone.baseFee, isActive: zone.isActive },
  );
  return zone;
}

/**
 * Deactivate rather than delete.
 *
 * `orders` carry no zone reference, but a past order's delivery fee only makes
 * sense against the zone that produced it, and the storefront already filters
 * on `is_active`. Deactivating removes it from checkout while keeping the
 * pricing history intact.
 */
export async function deactivateDeliveryZone(zoneId: string, actor: AdminActor) {
  return patchDeliveryZone(zoneId, { isActive: false }, actor);
}
