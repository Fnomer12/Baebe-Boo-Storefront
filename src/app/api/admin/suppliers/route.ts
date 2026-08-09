import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import {
  createSupplier,
  deleteSupplier,
  listSupplierBalances,
  listSuppliers,
  updateSupplier,
} from "@/lib/admin/procurement";

const supplierSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

export async function GET() {
  const authorization = await authorizeAdminApi("orders:read");
  if (!authorization.authorized) return authorization.response;

  try {
    const [suppliers, balances] = await Promise.all([listSuppliers(), listSupplierBalances()]);
    return NextResponse.json({ suppliers, balances });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Suppliers could not be loaded.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminApi("orders:write");
  if (!authorization.authorized) return authorization.response;

  const body = await request.json().catch(() => ({}));
  const parse = supplierSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ message: "Invalid supplier data." }, { status: 400 });
  }

  try {
    const supplier = await createSupplier(parse.data);
    return NextResponse.json({ supplier }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supplier could not be created.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const authorization = await authorizeAdminApi("orders:write");
  if (!authorization.authorized) return authorization.response;

  const body = await request.json().catch(() => ({}));
  const parse = supplierSchema.partial().safeParse(body);
  if (!parse.success || !body.id) {
    return NextResponse.json({ message: "Invalid supplier data." }, { status: 400 });
  }

  try {
    const supplier = await updateSupplier(body.id, parse.data);
    return NextResponse.json({ supplier });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supplier could not be updated.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeAdminApi("orders:write");
  if (!authorization.authorized) return authorization.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ message: "Supplier ID is required." }, { status: 400 });
  }

  try {
    await deleteSupplier(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supplier could not be deleted.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
