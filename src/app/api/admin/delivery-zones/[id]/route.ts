import { NextResponse } from "next/server";
import {
  AdminDeliveryError,
  deactivateDeliveryZone,
  patchDeliveryZone,
} from "@/lib/admin/delivery";
import {
  deliveryZoneIdSchema,
  deliveryZonePatchSchema,
} from "@/lib/admin/delivery-schemas";
import { authorizeAdminApi } from "@/lib/auth";

function deliveryError(error: unknown) {
  if (error instanceof AdminDeliveryError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { message: "The delivery zone operation could not be completed." },
    { status: 500 },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("stores:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const zoneId = deliveryZoneIdSchema.safeParse(id);
  const input = deliveryZonePatchSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!zoneId.success || !input.success) {
    const message =
      (input.success
        ? undefined
        : input.error.issues.find((issue) => issue.path.includes("estimatedDaysMax"))
            ?.message) || "Invalid delivery zone update.";
    return NextResponse.json({ message }, { status: 400 });
  }

  try {
    const zone = await patchDeliveryZone(zoneId.data, input.data, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    return NextResponse.json({ zone });
  } catch (error) {
    return deliveryError(error);
  }
}

/** Deactivates the zone. Pricing history is kept; see deactivateDeliveryZone. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("stores:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const zoneId = deliveryZoneIdSchema.safeParse(id);
  if (!zoneId.success) {
    return NextResponse.json({ message: "Invalid zone identifier." }, { status: 400 });
  }

  try {
    const zone = await deactivateDeliveryZone(zoneId.data, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    return NextResponse.json({ zone });
  } catch (error) {
    return deliveryError(error);
  }
}
