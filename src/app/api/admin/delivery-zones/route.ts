import { NextResponse } from "next/server";
import {
  AdminDeliveryError,
  createDeliveryZone,
  listDeliveryZones,
} from "@/lib/admin/delivery";
import { deliveryZoneCreateSchema } from "@/lib/admin/delivery-schemas";
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

export async function GET() {
  const authorization = await authorizeAdminApi("stores:read");
  if (!authorization.authorized) return authorization.response;

  try {
    return NextResponse.json({ zones: await listDeliveryZones() });
  } catch (error) {
    return deliveryError(error);
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminApi("stores:write");
  if (!authorization.authorized) return authorization.response;

  const input = deliveryZoneCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) {
    // The day-ordering rule is the one a manager can plausibly trip, so it is
    // echoed back; everything else stays generic.
    const message =
      input.error.issues.find((issue) => issue.path.includes("estimatedDaysMax"))
        ?.message || "Invalid delivery zone details.";
    return NextResponse.json({ message }, { status: 400 });
  }

  try {
    const zone = await createDeliveryZone(input.data, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    return NextResponse.json({ zone }, { status: 201 });
  } catch (error) {
    return deliveryError(error);
  }
}
