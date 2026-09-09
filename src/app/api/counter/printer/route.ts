import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCounterApi } from "@/lib/auth";
import {
  buildNativeReceiptCalibrationJob,
} from "@/lib/labels/native-print";

const requestSchema = z.object({
  action: z.enum(["test-job", "verify"]),
  printer: z.string().trim().min(1).max(128).optional(),
  bridgeJobId: z.string().trim().min(1).max(256).optional(),
});

export async function GET() {
  const authorization = await authorizeCounterApi();
  if (!authorization.authorized) return authorization.response;

  return NextResponse.json(
    {
      transport: "local-bridge",
      message: "Printer discovery happens on the workstation visiting this page.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const authorization = await authorizeCounterApi();
  if (!authorization.authorized) return authorization.response;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "The local printer request is invalid." }, { status: 400 });
  }

  if (parsed.data.action === "test-job") {
    return NextResponse.json({
      transport: "local-bridge",
      title: "Baebe Boo counter printer connection test",
      jobBase64: buildNativeReceiptCalibrationJob().toString("base64"),
    });
  }

  if (!parsed.data.printer || !parsed.data.bridgeJobId) {
    return NextResponse.json({ message: "The local printer test has not completed." }, { status: 400 });
  }

  const response = NextResponse.json({ verified: true, printer: parsed.data.printer });
  response.cookies.set("baebe_printer_verified", parsed.data.printer, {
      httpOnly: true,
      maxAge: 60 * 60 * 8,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  return response;
}
