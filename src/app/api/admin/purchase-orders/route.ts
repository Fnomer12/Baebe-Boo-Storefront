import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import {
  createPurchaseOrder,
  listPurchaseOrders,
  receivePurchaseOrder,
  updatePurchaseOrderStatus,
  type CreatePurchaseOrderInput,
  type ReceivePurchaseOrderInput,
} from "@/lib/admin/procurement";

const itemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1),
  unitCost: z.number().min(0),
});

const createSchema = z.object({
  supplierId: z.string().uuid(),
  shopId: z.string().uuid().optional().nullable(),
  referenceNumber: z.string().optional(),
  expectedDeliveryDate: z.string().optional().nullable(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

const receiveSchema = z.object({
  id: z.string().uuid(),
  items: z.array(
    z.object({
      purchaseOrderItemId: z.string().uuid(),
      quantityReceived: z.number().int().min(1),
      unitCost: z.number().min(0).optional(),
    }),
  ).min(1),
  notes: z.string().optional(),
});

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "sent", "partial", "received", "cancelled"]),
});

export async function GET() {
  const authorization = await authorizeAdminApi("orders:read");
  if (!authorization.authorized) return authorization.response;

  try {
    const orders = await listPurchaseOrders();
    return NextResponse.json({ orders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Purchase orders could not be loaded.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminApi("orders:write");
  if (!authorization.authorized) return authorization.response;

  const body = await request.json().catch(() => ({}));
  const parse = createSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ message: "Invalid purchase order data." }, { status: 400 });
  }

  try {
    const order = await createPurchaseOrder(parse.data as CreatePurchaseOrderInput);
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Purchase order could not be created.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeAdminApi("orders:write");
  if (!authorization.authorized) return authorization.response;

  const body = await request.json().catch(() => ({}));

  if (body.action === "receive") {
    const parse = receiveSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json({ message: "Invalid receipt data." }, { status: 400 });
    }
    try {
      const grnId = await receivePurchaseOrder(parse.data.id, parse.data as ReceivePurchaseOrderInput);
      return NextResponse.json({ grnId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Goods could not be received.";
      return NextResponse.json({ message }, { status: 500 });
    }
  }

  const parse = statusSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ message: "Invalid status update." }, { status: 400 });
  }

  try {
    const order = await updatePurchaseOrderStatus(parse.data.id, parse.data.status);
    return NextResponse.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Purchase order could not be updated.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
